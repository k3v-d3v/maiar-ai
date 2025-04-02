import { Logger } from "winston";

import { Runtime } from "../";
import logger from "../../lib/logger";
import { ICapabilities } from "../managers/model/capability/types";
import { Executor, Trigger } from "./plugin.types";

/**
 * Abstract base class for defining a plugin.
 * A plugin consists of triggers, executors, and required capabilities.
 */
export abstract class Plugin {
  /** Unique identifier for the plugin. */
  public readonly id: string;

  /** Human-readable name of the plugin. */
  public readonly name: string;

  /** Description of what the plugin does. */
  public readonly description: string;

  /** List of required capabilities the plugin depends on. */
  private _requiredCapabilities: (keyof ICapabilities)[];

  /** Triggers associated with the plugin. */
  public triggers: Trigger[];

  /** Executors associated with the plugin. */
  public executors: Executor[];

  /** The runtime instance assigned to the plugin. */
  private _runtime: Runtime | undefined;

  /**
   * Retrieves a scoped logger instance for the plugin.
   * @returns {Logger} A logger with a `plugin.<id>` scope.
   */
  public get logger(): Logger {
    return logger.child({ scope: `plugin.${this.id}` });
  }

  /**
   * Retrieves the assigned runtime instance.
   * @throws {Error} If the runtime is not available.
   * @returns {Runtime} The plugin's assigned runtime.
   */
  public get runtime(): Runtime {
    if (!this._runtime) throw new Error("Runtime not available");
    return this._runtime;
  }

  /**
   * Retrieves the capabilities required by the plugin.
   * @returns {(keyof ICapabilities)[]} The array of required capabilities.
   */
  public get requiredCapabilities(): (keyof ICapabilities)[] {
    return this._requiredCapabilities;
  }

  /**
   * Creates a new plugin instance.
   * @param {Object} params - The plugin initialization parameters.
   * @param {string} params.id - Unique identifier for the plugin.
   * @param {string} params.name - Human-readable name of the plugin.
   * @param {string} params.description - Description of the plugin.
   * @param {(keyof ICapabilities)[]} params.requiredCapabilities - Capabilities required by the plugin.
   */
  constructor({
    id,
    name,
    description,
    requiredCapabilities
  }: {
    id: string;
    name: string;
    description: string;
    requiredCapabilities: (keyof ICapabilities)[];
  }) {
    this.id = id;
    this.name = name;
    this.description = description;

    this.executors = [];
    this.triggers = [];
    this._requiredCapabilities = requiredCapabilities;
    this._runtime = undefined;
  }

  /**
   * Initializes the plugin. Must be implemented by subclasses.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public abstract init(): Promise<void> | void;

  /**
   * Shuts down the plugin. Must be implemented by subclasses.
   * @returns {Promise<void>} A promise that resolves when shutdown is complete.
   */
  public abstract shutdown(): Promise<void> | void;

  /**
   * @internal Sets the runtime for the plugin to be used internally by the runtime only.
   * @param {Runtime} runtime - The runtime instance to associate with the plugin.
   */
  public __setRuntime(runtime: Runtime): void {
    this._runtime = runtime;
  }
}
