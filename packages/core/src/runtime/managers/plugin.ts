import logger from "../../lib/logger";
import { Plugin } from "../providers/plugin";

/**
 * Registry for managing plugins
 */
export class PluginRegistry {
  private plugins: Map<string, Plugin>;

  constructor() {
    this.plugins = new Map<string, Plugin>();
  }

  public registerPlugins(...plugins: Plugin[]): PluginRegistry {
    for (const plugin of plugins) {
      this.registerPlugin(plugin);
    }

    return this;
  }

  public async init(): Promise<void> {
    await Promise.all(
      Array.from(this.plugins.values()).map(async (plugin) => {
        await plugin.init();
      })
    );
  }

  /**
   * Register a new plugin
   */
  private registerPlugin(plugin: Plugin): void {
    if (!plugin.id) {
      logger.error({
        type: "registry.plugin.validation.failed",
        message: "Plugin ID validation failed",
        logLevel: "error",
        metadata: {
          error: "ID cannot be empty"
        }
      });
      throw new Error("Plugin ID cannot be empty");
    }

    if (this.plugins.has(plugin.id)) {
      const existing = Array.from(this.plugins.keys());
      logger.error({
        type: "registry.plugin.id.collision",
        message: "Plugin ID collision",
        logLevel: "error",
        metadata: {
          id: plugin.id,
          existingPlugins: existing
        }
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
      logger.error({
        type: "registry.plugin.not_found",
        message: "Plugin not found",
        logLevel: "error",
        metadata: {
          id,
          availablePlugins: Array.from(this.plugins.keys())
        }
      });
      throw new Error(
        `Plugin ID ${id} not found. Available plugins: ${Array.from(
          this.plugins.keys()
        ).join(", ")}`
      );
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
