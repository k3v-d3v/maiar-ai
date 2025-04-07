export class EntrypointBuilder {
  private modelProviders: string[];
  private memoryProvider: string;
  private plugins: string[];

  constructor(
    modelProviders: string[],
    memoryProvider: string,
    plugins: string[]
  ) {
    this.modelProviders = modelProviders;
    this.memoryProvider = memoryProvider;
    this.plugins = plugins;
  }

  private imports(): string {
    const coreImports: string[] = [
      'import "dotenv/config";',
      'import path from "path";',
      'import { Runtime, ModelProvider, MemoryProvider, Plugin } from "@maiar-ai/core";',
      'import { stdout } from "@maiar-ai/core/logger";'
    ];

    const modelImports: string[] = [];
    const memoryImports: string[] = [];
    const pluginImports: string[] = [];

    if (this.modelProviders.includes("@maiar-ai/model-openai")) {
      modelImports.push(
        'import { OpenAIModelProvider, OpenAITextGenerationModel } from "@maiar-ai/model-openai";'
      );
    }

    if (this.modelProviders.includes("@maiar-ai/model-ollama")) {
      modelImports.push(
        'import { OllamaModelProvider } from "@maiar-ai/model-ollama";'
      );
    }

    if (this.memoryProvider === "@maiar-ai/memory-sqlite") {
      memoryImports.push(
        'import { SQLiteMemoryProvider } from "@maiar-ai/memory-sqlite";'
      );
    }

    if (this.memoryProvider === "@maiar-ai/memory-filesystem") {
      memoryImports.push(
        'import { FileSystemMemoryProvider } from "@maiar-ai/memory-filesystem";'
      );
    }

    if (this.memoryProvider === "@maiar-ai/memory-postgres") {
      memoryImports.push(
        'import { PostgresMemoryProvider } from "@maiar-ai/memory-postgres";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-text")) {
      pluginImports.push(
        'import { TextGenerationPlugin } from "@maiar-ai/plugin-text";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-search")) {
      pluginImports.push(
        'import { SearchPlugin } from "@maiar-ai/plugin-search";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-character")) {
      pluginImports.push(
        'import { CharacterPlugin } from "@maiar-ai/plugin-character";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-discord")) {
      pluginImports.push(
        'import { DiscordPlugin } from "@maiar-ai/plugin-discord";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-express")) {
      pluginImports.push(
        'import { ExpressPlugin } from "@maiar-ai/plugin-express";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-image")) {
      pluginImports.push(
        'import { ImageGenerationPlugin } from "@maiar-ai/plugin-image";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-telegram")) {
      pluginImports.push(
        'import { TelegramPlugin } from "@maiar-ai/plugin-telegram";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-terminal")) {
      pluginImports.push(
        'import { TerminalPlugin } from "@maiar-ai/plugin-terminal";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-websocket")) {
      pluginImports.push(
        'import { WebSocketPlugin } from "@maiar-ai/plugin-websocket";'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-x")) {
      pluginImports.push('import { XPlugin } from "@maiar-ai/plugin-x";');
    }

    return [
      ...coreImports,
      ...modelImports,
      ...memoryImports,
      ...pluginImports
    ].join("\n");
  }

  private modelProviderInstance(): string {
    const instances: string[] = [];

    if (this.modelProviders.includes("@maiar-ai/model-openai")) {
      instances.push(
        `new OpenAIModelProvider({
      apiKey: process.env.OPENAI_API_KEY as string,
      models: [OpenAITextGenerationModel.GPT4O]
    })`
      );
    }

    if (this.modelProviders.includes("@maiar-ai/model-ollama")) {
      instances.push(`new OllamaModelProvider({
      baseUrl: "http://localhost:11434",
      model: "llama3.1:8b"
    })`);
    }

    return instances.join(",\n\t\t");
  }

  private memoryProviderInstance(): string {
    if (this.memoryProvider === "@maiar-ai/memory-sqlite") {
      return "new SQLiteMemoryProvider({ dbPath: path.join(process.cwd(), 'data', 'conversations.db') })";
    }

    if (this.memoryProvider === "@maiar-ai/memory-filesystem") {
      return "new FileSystemMemoryProvider()";
    }

    if (this.memoryProvider === "@maiar-ai/memory-postgres") {
      return "new PostgresMemoryProvider()";
    }

    return "";
  }

  private pluginsInstance(): string {
    const instances: string[] = [];

    if (this.plugins.includes("@maiar-ai/plugin-text")) {
      instances.push("new TextGenerationPlugin()");
    }

    if (this.plugins.includes("@maiar-ai/plugin-search")) {
      instances.push(
        "new SearchPlugin({ apiKey: process.env.PERPLEXITY_API_KEY as string })"
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-character")) {
      instances.push(
        'new CharacterPlugin({ character: "Answer all questions in the style of a pirate" })'
      );
    }

    if (this.plugins.includes("@maiar-ai/plugin-discord")) {
      instances.push("new DiscordPlugin()");
    }

    if (this.plugins.includes("@maiar-ai/plugin-express")) {
      instances.push("new ExpressPlugin()");
    }

    if (this.plugins.includes("@maiar-ai/plugin-image")) {
      instances.push("new ImageGenerationPlugin()");
    }

    if (this.plugins.includes("@maiar-ai/plugin-telegram")) {
      instances.push("new TelegramPlugin()");
    }

    if (this.plugins.includes("@maiar-ai/plugin-terminal")) {
      instances.push('new TerminalPlugin({ agentName: "pirate" })');
    }

    if (this.plugins.includes("@maiar-ai/plugin-websocket")) {
      instances.push("new WebSocketPlugin()");
    }

    if (this.plugins.includes("@maiar-ai/plugin-x")) {
      instances.push("new XPlugin()");
    }

    return instances.join(",\n\t\t");
  }

  private main(): string {
    return `async function main() {
  const modelProviders: ModelProvider[] = [
    ${this.modelProviderInstance()}
  ];

  const memoryProvider: MemoryProvider = ${this.memoryProviderInstance()};

  const plugins: Plugin[] = [
    ${this.pluginsInstance()}
  ];

  const capabilityAliases: string[][] = [];

  const agent = await Runtime.init({
    modelProviders,
    memoryProvider,
    plugins,
    capabilityAliases,
    options: {
      logger: {
        level: "info",
        transports: [stdout]
      }
    }
    });

  await agent.start();
}`;
  }

  public build(): string {
    return `${this.imports()}

${this.main()}

(async () => {
  try {
    console.log("Starting agent...");
    await main();
  } catch (error) {
    console.error("Failed to start agent");
    console.error(error);
  }
})();`;
  }
}
