import * as path from "path";

import { Executor, Plugin, Trigger } from "@maiar-ai/core";

import { createAllCustomExecutors } from "./executors";
import { runAuthFlow } from "./scripts/auth-flow";
import { TokenStorage, XService } from "./services";
import { createAllCustomTriggers } from "./triggers";
import {
  TriggerConfig,
  XExecutorFactory,
  XPluginConfig,
  XTriggerFactory
} from "./types";

export class XPlugin extends Plugin {
  private xService: XService;
  private tokenStorage: TokenStorage;
  private isAuthenticated = false;

  constructor(private config: XPluginConfig) {
    super({
      id: "plugin-x",
      name: "X",
      description: "Handles X (Twitter) requests for the Maiar agent",
      requiredCapabilities: []
    });

    // Initialize token storage in the data directory
    const dataFolder = path.resolve(process.cwd(), "data");
    this.tokenStorage = new TokenStorage(dataFolder);

    // Initialize X service
    this.xService = new XService({
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      callback_url: this.config.callback_url,
      bearer_token: this.config.bearer_token,
      getStoredToken: async () => this.tokenStorage.getToken(),
      storeToken: async (token) => this.tokenStorage.storeToken(token)
    });

    // Executors and triggers will be registered in the init method, after runtime is available
  }

  /**
   * Override parent init to set the runtime and perform plugin initialization
   * This is called by the runtime during system startup
   */
  public async init(): Promise<void> {
    // This log confirms that we're being initialized with a valid runtime
    this.logger.info("plugin x initializing...", { type: "plugin-x" });

    // Validate required configuration
    if (!this.config.client_id || !this.config.callback_url) {
      this.logger.error("❌ x plugin error: missing required configuration", {
        type: "plugin-x"
      });
      this.logger.error(
        "the x plugin requires at minimum:\n- client_id: Your X API OAuth 2.0 client ID\n- callback_url: Your OAuth callback URL",
        {
          type: "plugin-x"
        }
      );

      // Throw a fatal error instead of just warning
      throw new Error(
        "X Plugin initialization failed: Missing required configuration. Please set the required environment variables and restart the application."
      );
    }

    // Try to authenticate with stored tokens first
    this.isAuthenticated = await this.xService.authenticate();

    // Verify the authentication actually works with a health check
    if (this.isAuthenticated) {
      this.isAuthenticated = await this.xService.checkHealth();
      // If health check fails, force reauthorization
      if (!this.isAuthenticated) {
        this.logger.warn(
          "⚠️ stored authentication token found but failed health check. token may be invalid or expired.",
          {
            type: "plugin-x"
          }
        );
        // Remove the invalid token
        await this.tokenStorage.removeToken();
      }
    }

    if (!this.isAuthenticated) {
      this.logger.warn("🔐 x api authentication required", {
        type: "plugin-x"
      });

      this.logger.warn(
        "no valid authentication token found. starting authentication flow...",
        {
          type: "plugin-x"
        }
      );

      // Automatically run the authentication flow
      this.logger.warn(
        "you can also manually run authentication at any time with: pnpm maiar-x-login",
        {
          type: "plugin-x"
        }
      );

      try {
        // Run the auth flow with plugin config
        const success = await this.runAuthentication();

        if (success) {
          this.logger.info("x plugin authenticated successfully", {
            type: "plugin-x"
          });
        } else {
          this.logger.error(
            "❌ x plugin authentication failed. plugin functionality will be limited.",
            {
              type: "plugin-x"
            }
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ x plugin authentication error: ${error}. you can attempt manual authentication with: pnpm maiar-x-login`,
          {
            type: "plugin-x"
          }
        );
        throw error;
      }
    } else {
      this.logger.info("x plugin authenticated successfully", {
        type: "plugin-x"
      });
    }

    // Register executors and triggers now that we have a runtime
    this.registerExecutorsAndTriggers();

    this.logger.info("x plugin initialized.", {
      type: "plugin-x"
    });
  }

  public async shutdown(): Promise<void> {}

  /**
   * Register both executors and triggers
   * This is separated from init for clarity and is only called after runtime is available
   */
  private registerExecutorsAndTriggers(): void {
    this.logger.info("registering x plugin executors and triggers", {
      type: "plugin-x"
    });

    // Register executors
    if (this.config.customExecutors) {
      // If customExecutors are provided as factories, instantiate them with xService
      const customExecutors = this.config.customExecutors as (
        | Executor
        | XExecutorFactory
      )[];

      for (const executorOrFactory of customExecutors) {
        if (typeof executorOrFactory === "function") {
          // It's a factory function, call it with xService and runtime
          this.executors.push(executorOrFactory(this.xService, this.runtime));
        } else {
          // It's a plain ExecutorImplementation, add it directly
          this.executors.push(executorOrFactory);
        }
      }
    } else {
      // Register all default custom executors with xService injected
      for (const executor of createAllCustomExecutors(
        this.xService,
        this.runtime
      )) {
        this.executors.push(executor);
      }
    }

    // Register triggers
    if (this.config.customTriggers) {
      // If customTriggers are provided as factories, instantiate them with xService
      const customTriggers = this.config.customTriggers as (
        | Trigger
        | XTriggerFactory
      )[];

      for (const triggerOrFactory of customTriggers) {
        if (typeof triggerOrFactory === "function") {
          // It's a factory function, call it with xService and runtime
          const triggerConfig: TriggerConfig = {};
          this.triggers.push(
            triggerOrFactory(this.xService, this.runtime, triggerConfig)
          );
        } else {
          // It's a plain Trigger, add it directly
          this.triggers.push(triggerOrFactory);
        }
      }
    } else {
      // Register all default custom triggers with xService injected
      const triggerConfig: TriggerConfig = {};
      for (const trigger of createAllCustomTriggers(
        this.xService,
        this.runtime,
        triggerConfig
      )) {
        this.triggers.push(trigger);
      }
    }

    this.logger.info(
      `registered ${this.executors.length} executors and ${this.triggers.length} triggers`,
      {
        type: "plugin-x"
      }
    );
  }

  /**
   * Check if the plugin is authenticated
   */
  public isAuthenticatedWithX(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Run the authentication flow using the plugin's configuration
   * This can be called directly to authenticate without using environment variables
   */
  public async runAuthentication(): Promise<boolean> {
    try {
      // Run auth flow with client credentials
      await runAuthFlow({
        client_id: this.config.client_id,
        client_secret: this.config.client_secret,
        callback_url: this.config.callback_url
      });

      // After runAuthFlow completes, check if we can authenticate
      this.isAuthenticated = await this.xService.authenticate();

      return this.isAuthenticated;
    } catch (error) {
      this.logger.error("authentication error:", {
        type: "plugin-x",
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}
