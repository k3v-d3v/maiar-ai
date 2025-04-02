import { Logger } from "winston";

import logger from "../../lib/logger";
import { Plugin } from "../providers/plugin";
import { Executor, Trigger } from "../providers/plugin.types";

/**
 * Registry for managing plugins
 */
export class PluginRegistry {
  private _plugins: Plugin[];
  private _triggers: Trigger[];
  private _executors: Executor[];

  private get logger(): Logger {
    return logger.child({ scope: "plugin.registry" });
  }

  public get plugins(): Plugin[] {
    return this._plugins;
  }

  public get triggers(): Trigger[] {
    return this._triggers;
  }

  public get executors(): Executor[] {
    return this._executors;
  }

  constructor() {
    this._plugins = [];
    this._triggers = [];
    this._executors = [];
  }

  public async registerPlugin(plugin: Plugin): Promise<void> {
    if (!plugin.id) {
      this.logger.error("plugin ID validation failed", {
        type: "registry.plugin.validation.failed",
        error: "ID cannot be empty"
      });
      throw new Error("Plugin ID cannot be empty");
    }

    if (this._plugins.some((p) => p.id === plugin.id)) {
      this.logger.error(`plugin id collision for ${plugin.id}`, {
        type: "registry.plugin.id.collision",
        error: "ID collision",
        pluginId: plugin.id,
        registeredPluginIds: this.plugins.map((p) => p.id)
      });

      throw new Error(
        `There is already a plugin registered with id ${plugin.id}`
      );
    }

    try {
      await plugin.init();

      this.logger.info(`plugin initialization for "${plugin.id}" successful`, {
        type: "plugin.init.success",
        plugin: plugin.id
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));

      this.logger.error(`plugin initialization for "${plugin.id}" failed`, {
        type: "plugin.init.failed",
        plugin: plugin.id,
        error: error.message
      });

      throw err;
    }

    this._plugins.push(plugin);
    this._triggers.push(...plugin.triggers);
    this._executors.push(...plugin.executors);

    this.logger.info(`plugin "${plugin.id}" registered successfully`, {
      type: "registry.plugin.registered",
      plugin: plugin.id,
      triggers: plugin.triggers.map((t) => t.name),
      executors: plugin.executors.map((e) => e.name)
    });
  }

  public async unregisterPlugin(plugin: Plugin): Promise<void> {
    const p = this._plugins.find((p) => p.id === plugin.id);
    if (!p) {
      this.logger.error("plugin not found", {
        type: "registry.plugin.not.found",
        pluginId: plugin.id
      });
      throw new Error(`Plugin with id ${plugin.id} not found`);
    }

    try {
      await plugin.shutdown();

      this.logger.info(`plugin shutdown for "${plugin.id}" successful`, {
        type: "plugin.shutdown.success",
        plugin: plugin.id
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));

      this.logger.error(`plugin shutdown for "${plugin.id}" failed`, {
        type: "plugin.shutdown.failed",
        plugin: plugin.id,
        error: error.message
      });

      throw err;
    }

    this._plugins = this._plugins.filter((p) => p.id !== plugin.id);
    this._triggers = this._triggers.filter((t) => !plugin.triggers.includes(t));
    this._executors = this._executors.filter(
      (e) => !plugin.executors.includes(e)
    );

    this.logger.info(`plugin "${plugin.id}" unregistered successfully`, {
      type: "registry.plugin.unregistered",
      plugin: plugin.id
    });
  }
}
