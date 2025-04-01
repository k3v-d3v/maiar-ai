import { Logger, LoggerOptions } from "winston";
import { z } from "zod";

import logger from "../lib/logger";
import { MemoryManager } from "./managers/memory";
import { ModelManager } from "./managers/model";
import { TEXT_GENERATION_CAPABILITY } from "./managers/model/capability/constants";
import { ICapabilities } from "./managers/model/capability/types";
import { PluginRegistry } from "./managers/plugin";
import {
  AgentContext,
  BaseContextItem,
  EventQueue,
  getUserInput,
  UserInputContext
} from "./pipeline/agent";
import { formatZodSchema, OperationConfig } from "./pipeline/operations";
import {
  extractJson,
  generateObjectTemplate,
  generatePipelineModificationTemplate,
  generatePipelineTemplate,
  generateRetryTemplate
} from "./pipeline/templates";
import {
  ContextItemWithHistory,
  ErrorContextItem,
  Pipeline,
  PipelineGenerationContext,
  PipelineModification,
  PipelineModificationContext,
  PipelineModificationSchema,
  PipelineSchema,
  PipelineStep
} from "./pipeline/types";
import { MemoryProvider } from "./providers/memory";
import { ModelProvider, ModelRequestConfig } from "./providers/model";
import { Plugin } from "./providers/plugin";

const REQUIRED_CAPABILITIES = [TEXT_GENERATION_CAPABILITY];

/**
 * Manages the lifecycle of the MAIAR runtime, including its core components:
 * - Model manager: Handles registered model providers and their capabilities.
 * - Memory manager: Manages the registered memory store.
 * - Plugin registry: Oversees registered plugins.
 * - Pipeline: Enables AI agentic behavior by orchestrating models, memory, and plugins.
 */
export class Runtime {
  private modelManager: ModelManager;
  private memoryManager: MemoryManager;
  private pluginRegistry: PluginRegistry;

  private isRunning: boolean;
  private eventQueue: AgentContext[];
  private queueInterface: EventQueue;
  private currentContext: AgentContext | undefined;

  /**
   * Returns a logger instance for the runtime used during initialization
   */
  private static get logger(): Logger {
    return logger.child({ type: "runtime.init" });
  }

  /**
   * Returns the memory manager instance for the runtime
   */
  public get memory(): MemoryManager {
    return this.memoryManager;
  }

  /**
   * Returns the logger instance for the runtime
   */
  public get logger(): Logger {
    return logger.child({ type: "runtime" });
  }

  /**
   * Returns the current context
   */
  public get context(): AgentContext | undefined {
    return this.currentContext;
  }

  private constructor(
    modelManager: ModelManager,
    memoryManager: MemoryManager,
    pluginRegistry: PluginRegistry
  ) {
    this.modelManager = modelManager;
    this.memoryManager = memoryManager;
    this.pluginRegistry = pluginRegistry;

    this.isRunning = false;
    this.eventQueue = [];
    this.queueInterface = {
      push: async (context: Omit<AgentContext, "eventQueue">) => {
        const userInput = getUserInput(context);

        // Pre-event logging and store user message
        this.logger.info("pre-event context chain state", {
          phase: "pre-event",
          user: userInput?.user,
          message: userInput?.rawMessage,
          contextChain: context.contextChain
        });

        // Get conversation history if user input exists
        let conversationHistory: {
          role: string;
          content: string;
          timestamp: number;
        }[] = [];
        if (userInput) {
          conversationHistory =
            await this.memoryManager.getRecentConversationHistory(
              userInput.user,
              userInput.pluginId
            );
        }

        // Add conversation history to the initial context item
        if (context.contextChain.length > 0) {
          context.contextChain[0] = {
            ...context.contextChain[0],
            messageHistory: conversationHistory
          } as ContextItemWithHistory;
        }

        // Add event to queue with wrapped response handler
        const fullContext: AgentContext = {
          ...context,
          eventQueue: this.queueInterface
        };

        try {
          // Store user message in memory
          if (userInput) {
            this.logger.info("storing user message in memory", {
              user: userInput.user,
              platform: userInput.pluginId,
              message: userInput.rawMessage,
              messageId: userInput.id
            });
            await this.memoryManager.storeUserInteraction(
              userInput.user,
              userInput.pluginId,
              userInput.rawMessage,
              userInput.timestamp,
              userInput.id
            );
          }

          // Wrap response handler if it exists
          if (fullContext.platformContext?.responseHandler) {
            const originalHandler = fullContext.platformContext.responseHandler;
            fullContext.platformContext.responseHandler = async (response) => {
              try {
                // Pre-response logging
                this.logger.info("pre-response context chain state", {
                  phase: "pre-response",
                  platform: userInput?.pluginId,
                  user: userInput?.user,
                  contextChain: this.context?.contextChain,
                  response
                });

                // Original response handler
                await originalHandler(response);

                // Post-response logging
                this.logger.info("post-response context chain state", {
                  phase: "post-response",
                  platform: userInput?.pluginId,
                  user: userInput?.user,
                  contextChain: this.context?.contextChain,
                  response
                });
              } catch (err: unknown) {
                const error =
                  err instanceof Error ? err : new Error(String(err));
                this.logger.error("error storing assistant response", {
                  error: error.message,
                  user: userInput?.user,
                  platform: userInput?.pluginId
                });
                throw error;
              }
            };
          }

          this.eventQueue.push(fullContext);
          this.logger.debug("queue updated", {
            queueLength: this.eventQueue.length
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error("error storing user message", {
            error: error.message,
            user: userInput?.user,
            platform: userInput?.pluginId
          });
          throw error;
        }
      },
      shift: async () => {
        return this.eventQueue.shift();
      }
    };
    this.currentContext = undefined;
  }

  /**
   * Initializes a new Runtime instance with the provided configuration
   * @param {Object} config - Configuration object
   * @param {ModelProvider[]} config.modelProviders - Array of model providers to register
   * @param {MemoryProvider} config.memoryProvider - Memory provider instance
   * @param {Plugin[]} config.plugins - Array of plugins to register
   * @param {string[][]} config.capabilityAliases - Array of capability alias mappings
   * @param {Object} [config.options] - Optional configuration settings
   * @param {LoggerOptions} [config.options.logger] - Logger options
   * @param {number} [config.options.timeout] - Startup timeout in seconds
   * @returns {Promise<Runtime>} Initialized Runtime instance
   */
  public static async init({
    modelProviders,
    memoryProvider,
    plugins,
    capabilityAliases,
    options
  }: {
    modelProviders: ModelProvider[];
    memoryProvider: MemoryProvider;
    plugins: Plugin[];
    capabilityAliases: string[][];
    options?: {
      logger?: LoggerOptions;
      timeout?: number;
    };
  }): Promise<Runtime> {
    if (options && options.logger) {
      logger.configure(options.logger);
    }

    if (options && options.timeout) {
      for (let i = 0; i < options.timeout; i++) {
        console.log(
          "waiting to start runtime for",
          options.timeout - i,
          "second(s)..."
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log("done waiting");
    }

    this.logger.info(`       
███╗   ███╗ █████╗ ██╗ █████╗ ██████╗ 
████╗ ████║██╔══██╗██║██╔══██╗██╔══██╗
██╔████╔██║███████║██║███████║██████╔╝
██║╚██╔╝██║██╔══██║██║██╔══██║██╔══██╗
██║ ╚═╝ ██║██║  ██║██║██║  ██║██║  ██║
╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
by Uranium Corporation
    `);
    this.logger.info("runtime initializing...");

    const modelManager = new ModelManager()
      .registerModelProviders(...modelProviders)
      .registerCapabilityAliases(capabilityAliases);
    await modelManager.init();
    await modelManager.checkHealth();

    // Check if model manager has at least 1 model provider with the required capabilities needed for the runtime
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!modelManager.hasCapability(capability)) {
        const error = `${capability} capability by a model provider is required for core runtime operations`;
        this.logger.error(error, {
          modelProviders: modelProviders.map((p) => p.getCapabilities()),
          runtimeRequiredCapabilities: REQUIRED_CAPABILITIES
        });
        throw new Error(error);
      }
    }

    this.logger.debug(
      "runtime's required capabilities by at least 1 model provider check passed successfully",
      {
        availableCapabilities: modelManager.getAvailableCapabilities(),
        runtimeRequiredCapabilities: REQUIRED_CAPABILITIES
      }
    );

    const memoryManager = new MemoryManager(memoryProvider);
    await memoryManager.init();
    await memoryManager.checkHealth();

    const pluginRegistry = new PluginRegistry().registerPlugins(...plugins);
    await pluginRegistry.init();

    // Validate all plugins have required capabilities implemented in the model manager
    for (const plugin of pluginRegistry.getAllPlugins()) {
      for (const capability of plugin.requiredCapabilities) {
        if (!modelManager.hasCapability(capability)) {
          const error = `plugin ${plugin.id} specified a required capability ${capability} that is not available`;
          this.logger.error(error);
          throw new Error(error);
        }
      }
    }

    this.logger.debug(
      "runtime has all model providers with required capabilities by plugins",
      {
        availableCapabilities: modelManager.getAvailableCapabilities(),
        pluginsRequiredCapabilities: plugins.map((p) => ({
          pluginId: p.id,
          requiredCapabilities: p.requiredCapabilities
        }))
      }
    );

    this.logger.info("runtime initialized succesfully", {
      modelProviders: modelProviders.map((p) => p.id),
      availableCapabilities: modelManager.getAvailableCapabilities(),
      memoryProvider: memoryProvider.id,
      plugins: plugins.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        requiredCapabilities: p.requiredCapabilities,
        triggers: p.triggers.map((t) => ({
          id: t.id
        })),
        executors: p.executors.map((e) => ({
          name: e.name,
          description: e.description
        }))
      }))
    });

    return new Runtime(modelManager, memoryManager, pluginRegistry);
  }

  /**
   * Starts the runtime:
   * - Starts all plugins' triggers
   * - Starts a loop that processes events from the plugins' triggers
   * @returns {Promise<void>}
   * @throws {Error} If runtime fails to start or encounters an error during execution
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    this.logger.info("ai agent (powered by $MAIAR) runtime started");

    for (const plugin of this.pluginRegistry.getAllPlugins()) {
      plugin._setRuntime(this);

      for (const trigger of plugin.triggers) {
        this.logger.info(
          `invoking ai agent's plugin id "${plugin.id}" trigger "${trigger.id}" start()...`,
          {
            pluginId: plugin.id,
            triggerId: trigger.id
          }
        );

        const initContext: UserInputContext = {
          id: `${plugin.id}-trigger-${Date.now()}`,
          pluginId: plugin.id,
          action: "trigger_init",
          type: "user_input",
          content: "", // Empty content for system trigger
          timestamp: Date.now(),
          rawMessage: "",
          user: "system"
        };

        trigger.start({
          eventQueue: this.queueInterface,
          contextChain: [initContext]
        });
      }
    }

    try {
      await this.runEvaluationLoop();
    } catch (err: unknown) {
      this.isRunning = false;

      const error = err as Error;
      console.error("Error in evaluation loop:", error);
      throw error;
    }
  }

  /**
   * Stops the runtime and ceases processing of events
   * @returns {Promise<void>}
   * @throws {Error} If runtime is not currently running
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) throw new Error("Runtime is not running");
    this.isRunning = false;
    this.logger.info("ai agent (powered by $MAIAR) runtime stopped");
  }

  /**
   * Get all registered plugins
   * @returns {Plugin[]} All registered plugins
   */
  public getPlugins(): Plugin[] {
    return this.pluginRegistry.getAllPlugins();
  }

  /**
   * Push a new context to the event queue
   * @param {AgentContext} context - The context to push to the event queue
   */
  public pushContext(context: AgentContext): void {
    this.eventQueue.push(context);
  }

  /**
   * Adds a new item to the context chain
   * @param {BaseContextItem} item - The item to add to the context chain
   */
  public pushToContextChain(item: BaseContextItem): void {
    if (this.context) {
      // If there's an existing context item for this plugin+action, update it
      const existingIndex = this.context.contextChain.findIndex(
        (existing) =>
          existing.pluginId === item.pluginId && existing.action === item.action
      );

      if (existingIndex !== -1) {
        // Merge the new item with the existing one
        this.context.contextChain[existingIndex] = {
          ...this.context.contextChain[existingIndex],
          ...item
        };
      } else {
        // Add as new item if no existing one found
        this.context.contextChain.push(item);
      }
    }
  }

  /**
   * Creates an event from a user input context
   * @param {UserInputContext} initialContext - The initial context to create the event from
   * @param {AgentContext["platformContext"]} [platformContext] - Optional platform context
   * @returns {Promise<void>}
   */
  public async createEvent(
    initialContext: UserInputContext,
    platformContext?: AgentContext["platformContext"]
  ): Promise<void> {
    // Get conversationId from memory manager
    const conversationId = await this.memoryManager.getOrCreateConversation(
      initialContext.user,
      initialContext.pluginId
    );

    // Add conversationId to platform context metadata
    const context: AgentContext = {
      contextChain: [initialContext],
      conversationId,
      platformContext,
      eventQueue: this.queueInterface
    };
    try {
      await this.queueInterface.push(context);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error("error pushing event to queue", {
        error: error.message,
        context: {
          platform: initialContext.pluginId,
          message: initialContext.rawMessage,
          user: initialContext.user
        }
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Runs the evaluation loop:
   * - Retrieves events from the event queue
   * - Evaluates the pipeline for each event
   * - Executes the pipeline
   * @returns {Promise<void>}
   */
  private async runEvaluationLoop(): Promise<void> {
    this.logger.info("evaluation loop started...");

    while (this.isRunning) {
      const context = this.eventQueue.shift();
      if (!context) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Sleep to prevent busy loop
        continue;
      }

      const userInput = getUserInput(context) as UserInputContext;
      this.logger.info("received context from queue", {
        platform: userInput.pluginId,
        message: userInput.rawMessage,
        queueLength: this.eventQueue.length
      });

      try {
        // Set current context before pipeline
        this.currentContext = context;

        this.logger.info("evaluating pipeline for context");

        const pipeline = await this.evaluatePipeline(context);
        this.logger.info("generated pipeline", { pipeline });

        this.logger.info("executing pipeline...");
        await this.executePipeline(pipeline, context);

        // Post-event logging
        this.logger.info("post-event context chain state", {
          platform: userInput.pluginId,
          user: userInput.user,
          contextChain: context.contextChain
        });

        // Store agent message and context in memory with complete context chain
        const lastContext = context.contextChain[
          context.contextChain.length - 1
        ] as BaseContextItem & { message: string };
        this.logger.info("storing assistant response in memory", {
          user: userInput.user,
          platform: userInput.pluginId,
          response: lastContext.message
        });

        await this.memoryManager.storeAssistantInteraction(
          userInput.user,
          userInput.pluginId,
          lastContext.message,
          context.contextChain
        );

        this.logger.info("pipeline execution complete");
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.info("error in evaluation loop", {
          error: error.message,
          message: userInput.rawMessage,
          platform: userInput.pluginId,
          user: userInput.user
        });

        throw error;
      } finally {
        // Clear current context after execution
        this.currentContext = undefined;
      }
    }
  }

  /**
   * Evaluates the pipeline for a given context
   * @param {AgentContext} context - The context to evaluate the pipeline for
   * @returns {Promise<Pipeline>} The evaluated pipeline
   */
  private async evaluatePipeline(context: AgentContext): Promise<Pipeline> {
    // Store the context in history if it's user input
    const userInput = getUserInput(context);

    // Get all available executors from plugins
    const availablePlugins = this.pluginRegistry
      .getAllPlugins()
      .map((plugin: Plugin) => ({
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        executors: plugin.executors.map((e) => ({
          name: e.name,
          description: e.description
        }))
      }));

    // Get platform and message from user input or use defaults
    const platform = userInput?.pluginId || "unknown";
    const message = userInput?.rawMessage || "";

    // Get conversation history if user input exists
    let conversationHistory: {
      role: string;
      content: string;
      timestamp: number;
    }[] = [];
    if (userInput) {
      conversationHistory =
        await this.memoryManager.getRecentConversationHistory(
          userInput.user,
          platform
        );
    }

    // Create the generation context
    const pipelineContext: PipelineGenerationContext = {
      contextChain: context.contextChain,
      availablePlugins,
      currentContext: {
        platform,
        message,
        conversationHistory
      }
    };

    try {
      // Generate the pipeline using model
      const template = generatePipelineTemplate(pipelineContext);

      // Log pipeline generation start
      this.logger.info("starting pipeline generation", {
        platform,
        message,
        template
      });

      this.logger.debug("generating pipeline", {
        context: pipelineContext,
        template,
        contextChain: context.contextChain
      });

      const pipeline = await this.getObject(PipelineSchema, template, {
        temperature: 0.2 // Lower temperature for more predictable outputs
      });

      // Add concise pipeline steps log
      const steps = pipeline.map((step) => `${step.pluginId}:${step.action}`);
      this.logger.info("pipeline steps", { steps });

      // Log successful pipeline generation
      this.logger.info("pipeline generation complete", {
        platform,
        message,
        template,
        pipeline,
        steps
      });

      this.logger.info("generated pipeline", { pipeline });

      return pipeline;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Log pipeline generation error
      this.logger.error("pipeline generation failed", {
        platform,
        message,
        error,
        template: generatePipelineTemplate(pipelineContext)
      });

      this.logger.error("error generating pipeline", {
        error: error.message,
        platform: userInput?.pluginId || "unknown",
        message: userInput?.rawMessage || "",
        contextChain: context.contextChain,
        generationContext: pipelineContext,
        template: generatePipelineTemplate(pipelineContext)
      });

      // Return empty pipeline on error
      return [];
    }
  }

  /**
   * Evaluates the pipeline modification for a given context
   * @param {PipelineModificationContext} context - The context to evaluate the pipeline modification for
   * @returns {Promise<PipelineModification>} The evaluated pipeline modification
   */
  private async evaluatePipelineModification(
    context: PipelineModificationContext
  ): Promise<PipelineModification> {
    const template = generatePipelineModificationTemplate(context);
    this.logger.debug("evaluating pipeline modification", {
      context,
      template
    });

    try {
      const modification = await this.getObject(
        PipelineModificationSchema,
        template,
        {
          temperature: 0.2 // Lower temperature for more predictable outputs
        }
      );

      this.logger.info("pipeline modification evaluation result", {
        shouldModify: modification.shouldModify,
        explanation: modification.explanation,
        modifiedSteps: modification.modifiedSteps
      });

      return modification;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error("error evaluating pipeline modification", {
        error: error.message
      });
      return {
        shouldModify: false,
        explanation: "Error evaluating pipeline modification",
        modifiedSteps: null
      };
    }
  }

  /**
   * Executes a pipeline
   * @param {PipelineStep[]} pipeline - The pipeline to execute
   * @param {AgentContext} context - The context to execute the pipeline in
   * @returns {Promise<void>}
   */
  private async executePipeline(
    pipeline: PipelineStep[],
    context: AgentContext
  ): Promise<void> {
    this.currentContext = context;

    try {
      let currentPipeline = [...pipeline];
      let currentStepIndex = 0;

      // Log initial pipeline state
      this.logger.debug("pipeline state updated", {
        currentPipeline,
        currentStepIndex,
        pipelineLength: currentPipeline.length,
        contextChain: context.contextChain
      });

      while (currentStepIndex < currentPipeline.length) {
        const currentStep = currentPipeline[currentStepIndex];
        if (!currentStep) {
          // Add error to context chain for invalid step
          const errorContext: ErrorContextItem = {
            id: `error-${Date.now()}`,
            pluginId: "runtime",
            type: "error",
            action: "invalid_step",
            content: "Invalid step encountered in pipeline",
            timestamp: Date.now(),
            error: "Invalid step encountered in pipeline"
          };
          context.contextChain.push(errorContext);
          currentStepIndex++;
          continue;
        }

        const plugin = this.pluginRegistry.getPlugin(currentStep.pluginId);
        if (!plugin) {
          // Add error to context chain for missing plugin
          const errorContext: ErrorContextItem = {
            id: `error-${Date.now()}`,
            pluginId: currentStep.pluginId,
            type: "error",
            action: "plugin_not_found",
            content: `Plugin ${currentStep.pluginId} not found`,
            timestamp: Date.now(),
            error: `Plugin ${currentStep.pluginId} not found`,
            failedStep: currentStep
          };
          context.contextChain.push(errorContext);
          currentStepIndex++;
          continue;
        }

        try {
          const result = await plugin.execute(currentStep.action, context);

          // Log step execution
          this.logger.debug("step execution completed", {
            currentPipeline,
            currentStepIndex,
            pipelineLength: currentPipeline.length,
            executedStep: { step: currentStep, result },
            contextChain: context.contextChain
          });

          if (!result.success) {
            // Add error to context chain for failed execution
            const errorContext: ErrorContextItem = {
              id: `error-${Date.now()}`,
              pluginId: currentStep.pluginId,
              type: "error",
              action: currentStep.action,
              content: result.error || "Unknown error",
              timestamp: Date.now(),
              error: result.error || "Unknown error",
              failedStep: currentStep
            };
            context.contextChain.push(errorContext);
          } else if (result.data) {
            // Add successful result to context chain
            context.contextChain.push({
              id: `${currentStep.pluginId}-${Date.now()}`,
              pluginId: currentStep.pluginId,
              type: currentStep.action,
              action: currentStep.action,
              content: JSON.stringify(result.data),
              timestamp: Date.now(),
              ...result.data
            });
          }

          // Evaluate pipeline modification with updated context
          const modification = await this.evaluatePipelineModification({
            contextChain: context.contextChain,
            currentStep,
            pipeline: currentPipeline,
            availablePlugins: this.pluginRegistry
              .getAllPlugins()
              .map((plugin) => ({
                id: plugin.id,
                name: plugin.name,
                description: plugin.description,
                executors: plugin.executors.map((e) => ({
                  name: e.name,
                  description: e.description
                }))
              }))
          });

          if (modification.shouldModify && modification.modifiedSteps) {
            // Apply the modification
            currentPipeline = [
              ...currentPipeline.slice(0, currentStepIndex + 1),
              ...modification.modifiedSteps
            ];

            // Log modification
            this.logger.info("pipeline modification applied", {
              currentPipeline,
              currentStepIndex,
              pipelineLength: currentPipeline.length,
              modification,
              contextChain: context.contextChain
            });

            // Emit pipeline modification event
            this.logger.info("pipeline modification applied", {
              explanation: modification.explanation,
              currentStep,
              modifiedSteps: modification.modifiedSteps,
              pipeline: currentPipeline
            });
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          // Add error to context chain for unexpected errors
          const errorContext: ErrorContextItem = {
            id: `error-${Date.now()}`,
            pluginId: currentStep.pluginId,
            type: "error",
            action: currentStep.action,
            content: error.message,
            timestamp: Date.now(),
            error: error.message,
            failedStep: currentStep
          };
          context.contextChain.push(errorContext);

          // Log failed step
          this.logger.error("step execution failed", {
            currentPipeline,
            currentStepIndex,
            pipelineLength: currentPipeline.length,
            executedStep: {
              step: currentStep,
              result: {
                success: false,
                error: error.message
              }
            },
            contextChain: context.contextChain
          });
        }

        currentStepIndex++;
      }
    } finally {
      this.currentContext = undefined;
    }
  }

  /**
   * Attempts to generate an object from an LLM using a zod schema and prompt, then parses the response as JSON.
   * Retries up to `maxRetries` times in case of errors.
   *
   * @template T - A Zod schema type used for validation.
   * @param {T} schema - The Zod schema to validate the generated object.
   * @param {string} prompt - The prompt used for the text generation model.
   * @param {OperationConfig & { maxRetries?: number }} [config] - Optional configuration, including max retries.
   * @returns {Promise<T>} - The parsed and validated object.
   * @throws {Error} - Throws if all retries fail.
   */
  public async getObject<T extends z.ZodType>(
    schema: T,
    prompt: string,
    config?: OperationConfig & { maxRetries?: number }
  ): Promise<z.infer<T>> {
    const MAX_RETRIES = config?.maxRetries || 3;
    let lastResponse: string = "";
    let lastJsonString: string = "";
    let lastError: string = "";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const input =
          attempt > 0
            ? generateRetryTemplate({
                schema: formatZodSchema(schema),
                prompt,
                lastResponse: lastResponse,
                error: lastError
              })
            : generateObjectTemplate({
                schema: formatZodSchema(schema),
                prompt
              });

        lastResponse = await this.modelManager.executeCapability(
          TEXT_GENERATION_CAPABILITY,
          input,
          config
        );
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);

        this.logger.error("failed to generate object from LLM model", {
          error: lastError,
          attempt: attempt + 1
        });

        if (attempt === MAX_RETRIES - 1) throw err;
      }

      try {
        lastJsonString = extractJson(lastResponse).trim();
        const json = JSON.parse(lastJsonString);
        const result = schema.parse(json);

        this.logger.debug("successfully parsed JSON from LLM model response", {
          output: result
        });

        return result;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        this.logger.error(
          "failed to extract and parse JSON from LLM model response",
          {
            error: lastError,
            attempt: attempt + 1,
            jsonString: lastJsonString
          }
        );

        if (attempt === MAX_RETRIES - 1) throw err;
      }
    }
  }

  /**
   * Executes a capability by a model provider registered to the model manager
   * @param {string} capabilityId - The capability ID to execute
   * @param {ICapabilities[K]["input"]} input - The input for the capability
   * @param {ModelRequestConfig} [config] - Optional configuration
   * @returns {Promise<ICapabilities[K]["output"]>} The capability's output
   */
  public async executeCapability<K extends keyof ICapabilities>(
    capabilityId: K,
    input: ICapabilities[K]["input"],
    config?: ModelRequestConfig
  ): Promise<ICapabilities[K]["output"]> {
    return this.modelManager.executeCapability(capabilityId, input, config);
  }
}
