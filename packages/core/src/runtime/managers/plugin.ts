import { Logger } from "winston";

import logger from "../../lib/logger";
import { Plugin } from "../providers/plugin";

/**
 * Registry for managing plugins
 */
export class PluginRegistry {
  private plugins: Map<string, Plugin>;

  public get logger(): Logger {
    return logger.child({ scope: "plugin.registry" });
  }

  constructor(...plugins: Plugin[]) {
    this.plugins = new Map<string, Plugin>();

    for (const plugin of plugins) {
      this.registerPlugin(plugin);
    }
  }

  /**
   * Register a new plugin
   */
  public registerPlugin(plugin: Plugin): void {
    if (!plugin.id) {
      this.logger.error("plugin ID validation failed", {
        type: "registry.plugin.validation.failed",
        error: "ID cannot be empty"
      });
      throw new Error("Plugin ID cannot be empty");
    }

    if (this.plugins.has(plugin.id)) {
      const existing = Array.from(this.plugins.keys());
      this.logger.error("plugin ID collision", {
        type: "registry.plugin.id.collision",
        error: "ID collision",
        id: plugin.id,
        existingPlugins: existing
      });

      throw new Error(
        `Plugin ID collision: ${plugin.id} is already registered.\n` +
          `Currently registered plugins: ${existing.join(", ")}`
      );
    }

    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Get a plugin by id
   */
  public getPlugin(id: string): Plugin | undefined {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      this.logger.error("plugin not found", {
        type: "registry.plugin.not_found",
        error: "Plugin not found",
        id,
        availablePlugins: Array.from(this.plugins.keys())
      });
    }
    return plugin;
  }

  /**
   * Get all registered plugins
   */
  public getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}
