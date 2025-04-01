import { Logger } from "winston";

import logger from "../../../lib/logger";
import { OperationConfig } from "../../pipeline/operations";
import { ModelProvider } from "../../providers/model";
import { CapabilityRegistry } from "./capability";
import { ICapabilities } from "./capability/types";

/**
 * ModelManager is responsible to managing model providers and their capabilities
 */
export class ModelManager {
  private models: Map<string, ModelProvider>;
  private capabilityRegistry: CapabilityRegistry;
  private capabilityAliases: Map<string, string>;

  /**
   * Returns a namespaced logger instance for the model manager
   *
   * @private
   * @returns {Logger} Logger instance
   */
  private get logger(): Logger {
    return logger.child({ type: "model.manager" });
  }

  constructor() {
    this.models = new Map<string, ModelProvider>();
    this.capabilityRegistry = new CapabilityRegistry();
    this.capabilityAliases = new Map<string, string>();
  }

  /**
   * Initializes all registered model providers
   *
   * @returns {Promise<void>}
   */
  public async init(): Promise<void> {
    await Promise.all(
      Array.from(this.models.values()).map(async (modelProvider) => {
        try {
          await modelProvider.init();
          this.logger.debug(
            `model provider "${modelProvider.id}" initialized successfully`,
            { modelProvider: modelProvider.id }
          );
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `model provider initialization failed for "${modelProvider.id}"`,
            { error: error.message }
          );
        }
      })
    );
  }

  /**
   * Checks the health of all registered model providers
   *
   * @returns {Promise<void>}
   */
  public async checkHealth(): Promise<void> {
    await Promise.all(
      Array.from(this.models.values()).map(async (model) => {
        try {
          await model.checkHealth();
          this.logger.debug(
            `health check for model provider "${model.id}" passed`,
            { modelProvider: model.id }
          );
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `health check for model provider "${model.id}" failed`,
            { modelProvider: model.id, error: error.message }
          );

          throw error;
        }
      })
    );
  }

  /**
   * Registers one or more model providers to the model manager
   *
   * @param {...ModelProvider} modelProviders - The model providers to register
   * @returns {ModelManager} The current instance of the model manager
   */
  public registerModelProviders(
    ...modelProviders: ModelProvider[]
  ): ModelManager {
    for (const modelProvider of modelProviders) {
      this.registerModelProvider(modelProvider);
    }

    return this;
  }

  /**
   * Registers a single model provider and its capabilities
   *
   * @private
   * @param {ModelProvider} modelProvider - The model provider to register
   * @returns {void}
   */
  private registerModelProvider(modelProvider: ModelProvider): void {
    this.models.set(modelProvider.id, modelProvider);

    // Register all capabilities provided by the model
    const capabilities = modelProvider.getCapabilities();
    for (const capability of capabilities) {
      this.capabilityRegistry.registerCapability(
        modelProvider.id,
        capability.id
      );

      // Check if this capability already has a default model
      // If not, set this model as the default for this capability
      if (
        !this.capabilityRegistry.getDefaultModelForCapability(capability.id)
      ) {
        this.capabilityRegistry.setDefaultModelForCapability(
          capability.id,
          modelProvider.id
        );
        this.logger.debug(
          `model provider "${modelProvider.id}" set as default for capability "${capability.id}"`,
          { modelProvider: modelProvider.id, capability: capability.id }
        );
      }
    }

    this.logger.debug(
      `model provider "${modelProvider.id}" registered successfully`
    );
  }

  /**
   * Registers capability aliases to the model manager
   *
   * @param {string[][]} capabilityAliases - The capability aliases to register
   * @returns {ModelManager} The current instance of the model manager
   */
  public registerCapabilityAliases(
    capabilityAliases: string[][]
  ): ModelManager {
    // Add capability aliases to the model manager
    for (const aliasGroup of capabilityAliases) {
      const canonicalId =
        aliasGroup.find((id) => this.hasCapability(id)) ??
        (aliasGroup[0] as string);

      // Register all other IDs in the group as aliases to the canonical ID
      for (const alias of aliasGroup) {
        if (alias !== canonicalId) {
          if (!this.capabilityRegistry.hasCapability(canonicalId)) {
            throw new Error(`Capability ${canonicalId} not found`);
          }
          this.capabilityAliases.set(alias, canonicalId);
          this.logger.debug(
            `registered capability alias "${alias}" to "${canonicalId}"`,
            { alias, canonicalId }
          );
        }
      }
    }

    return this;
  }

  /**
   * Get all available capabilities
   *
   * @returns {string[]} All available capabilities
   */
  public getAvailableCapabilities(): string[] {
    return this.capabilityRegistry.getAllCapabilities();
  }

  /**
   * Get all models that support a capability
   *
   * @param {string} capabilityId - The capability ID
   * @returns {string[]} All models that support the capability
   */
  public getModelsWithCapability(capabilityId: string): string[] {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    return this.capabilityRegistry.getModelsWithCapability(resolvedId);
  }

  /**
   * Sets the default model for a capability
   *
   * @param {string} capabilityId - The capability ID
   * @param {string} modelId - The model ID
   * @returns {void}
   */
  public setDefaultModelForCapability(
    capabilityId: string,
    modelId: string
  ): void {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    this.capabilityRegistry.setDefaultModelForCapability(resolvedId, modelId);
  }

  /**
   * Checks if any model supports a capability
   *
   * @param {string} capabilityId - The capability ID
   * @returns {boolean} True if any model supports the capability, false otherwise
   */
  public hasCapability(capabilityId: string): boolean {
    const resolvedId = this.capabilityAliases.get(capabilityId) || capabilityId;
    return this.capabilityRegistry.hasCapability(resolvedId);
  }

  /**
   * Executes a capability with the given input.
   *
   * @template K
   * @param {K} capabilityId - The capability ID
   * @param {ICapabilities[K]["input"]} input - The input for the capability
   * @param {OperationConfig} [config] - Optional configuration
   * @param {string} [modelId] - The model to use (optional)
   * @returns {Promise<ICapabilities[K]["output"]>} The capability's output
   * @throws {Error} If no valid model is found or input validation fails
   */
  public async executeCapability<K extends keyof ICapabilities>(
    capabilityId: K,
    input: ICapabilities[K]["input"],
    config?: OperationConfig,
    modelId?: string
  ): Promise<ICapabilities[K]["output"]> {
    // Resolve the canonical capability ID
    const resolvedCapabilityId =
      this.capabilityAliases.get(capabilityId as string) || capabilityId;

    // Get the effective model to use
    const effectiveModelId =
      modelId ||
      this.capabilityRegistry.getDefaultModelForCapability(
        resolvedCapabilityId as string
      );

    if (!effectiveModelId) {
      throw new Error(
        `No model specified and no default model set for capability ${resolvedCapabilityId}`
      );
    }

    const modelProvider = this.models.get(effectiveModelId);
    if (!modelProvider) {
      throw new Error(`Unknown model: ${effectiveModelId}`);
    }

    // Try to get the capability from the model
    const capability = modelProvider.getCapability(
      resolvedCapabilityId as string
    );
    if (!capability) {
      throw new Error(
        `Capability ${resolvedCapabilityId} not found on model ${modelProvider.id}`
      );
    }

    // Validate the input against the capability's input schema
    const validatedInput = capability.input.safeParse(input);
    if (!validatedInput.success) {
      throw new Error(
        `Invalid input for capability ${resolvedCapabilityId}: ${validatedInput.error}`
      );
    }
    const result = await capability.execute(validatedInput.data, config);
    return capability.output.parse(result) as ICapabilities[K]["output"];
  }
}
