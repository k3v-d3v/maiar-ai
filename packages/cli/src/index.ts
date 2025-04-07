#!/usr/bin/env node
import * as prompts from "@clack/prompts";
import { execSync } from "child_process";
import { Command } from "commander";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { EntrypointBuilder } from "./template";

const program = new Command();

program
  .command("create")
  .description(
    `Create a new Maiar project in TypeScript. 
With no arguments, start the CLI in interactive mode.
    
Model Providers (Official):
- Open AI
- Ollama

Memory Providers (Official):
- File System
- Postgres
- SQLite

Plugins (Official):
- Text Generation
- Search
- Character
- Discord
- Express
- Image Generation
- Telegram
- Terminal
- Time
- WebSocket
- X
    `
  )
  .argument(
    "[DIRECTORY]",
    "The directory to create the project in and the project name"
  )
  .option(
    "--model-providers <model-providers>",
    "The package name of the compatible Maiar model providers to use (space delimited)"
  )
  .option(
    "--memory-provider <memory-provider>",
    "The package name of the compatible Maiar memory provider to use"
  )
  .option(
    "--plugins <plugins>",
    "The package names of the compatible Maiar plugins to use (space delimited)"
  )
  .action(async (directory) => {
    const cwd = process.cwd();
    const cancel = () => prompts.cancel("🚫 Operation cancelled");

    let projectName = directory;
    if (!projectName) {
      const defaultProjectName = "maiar-project";
      projectName = await prompts.text({
        message: "🗃️ Project name:",
        placeholder: defaultProjectName,
        defaultValue: defaultProjectName
      });
    }

    if (prompts.isCancel(projectName)) return cancel();

    const modelProviders = await prompts.multiselect({
      message: "🧠 Which model provider(s) do you want to use?",
      options: [
        { label: "Open AI (recommended)", value: "@maiar-ai/model-openai" },
        { label: "Ollama", value: "@maiar-ai/model-ollama" }
      ],
      required: true
    });

    if (prompts.isCancel(modelProviders)) return cancel();

    let openaiApiKey: string | symbol = "";
    if (modelProviders.includes("@maiar-ai/model-openai")) {
      openaiApiKey = await prompts.text({
        message: "🔑 OpenAI API Key:",
        placeholder: "sk-...",
        defaultValue: "sk-..."
      });

      if (prompts.isCancel(openaiApiKey)) return cancel();
    }

    const memoryProvider = await prompts.select({
      message: "💾 Which memory provider do you want to use?",
      options: [
        { label: "SQLite (recommended)", value: "@maiar-ai/memory-sqlite" },
        { label: "File System", value: "@maiar-ai/memory-filesystem" },
        { label: "Postgres", value: "@maiar-ai/memory-postgres" }
      ]
    });

    if (prompts.isCancel(memoryProvider)) return cancel();

    const plugins = await prompts.multiselect({
      message: "🔍 Which plugin(s) do you want to use?",
      options: [
        {
          label: "Text Generation (recommended)",
          value: "@maiar-ai/plugin-text",
          hint: "A plugin that allows the AI Agent to generate text"
        },
        {
          label: "Search (recommended)",
          value: "@maiar-ai/plugin-search",
          hint: "A plugin that allows the AI Agent to search the web"
        },
        {
          label: "Character (recommended)",
          value: "@maiar-ai/plugin-character",
          hint: "A plugin that gives the AI Agent an identity"
        },
        {
          label: "Terminal (recommended)",
          value: "@maiar-ai/plugin-terminal",
          hint: "A plugin that allows the AI Agent to interact with the terminal"
        },
        {
          label: "Discord",
          value: "@maiar-ai/plugin-discord",
          hint: "A plugin that allows the AI Agent to interact with Discord"
        },
        {
          label: "Express",
          value: "@maiar-ai/plugin-express",
          hint: "A plugin that allows the AI Agent to interact with Express"
        },
        {
          label: "Image Generation",
          value: "@maiar-ai/plugin-image",
          hint: "A plugin that allows the AI Agent to generate images"
        },
        {
          label: "Telegram",
          value: "@maiar-ai/plugin-telegram",
          hint: "A plugin that allows the AI Agent to interact with Telegram"
        },
        {
          label: "Time",
          value: "@maiar-ai/plugin-time",
          hint: "A plugin that allows the AI Agent to get the current time"
        },
        {
          label: "WebSocket",
          value: "@maiar-ai/plugin-websocket",
          hint: "A plugin that allows the AI Agent to interact with WebSocket"
        },
        {
          label: "X",
          value: "@maiar-ai/plugin-x",
          hint: "A plugin that allows the AI Agent to interact with X"
        }
      ],
      required: true
    });

    if (prompts.isCancel(plugins)) return cancel();

    const projectPath = path.join(cwd, projectName);
    mkdirSync(projectPath, { recursive: true });

    const packageJson = {
      name: projectName,
      version: "1.0.0",
      main: "index.js",
      scripts: {
        test: 'echo "Error: no test specified" && exit 1',
        prestart: "tsc --project tsconfig.json",
        start: "node dist/index.js"
      },
      type: "module",
      dependencies: {
        "@maiar-ai/core": "^0.20.0",
        ...Object.fromEntries(modelProviders.map((m) => [m, "^0.20.0"])),
        [memoryProvider]: "^0.20.0",
        ...Object.fromEntries(plugins.map((p) => [p, "^0.20.0"]))
      },
      devDependencies: {
        tsx: "^4.7.0",
        typescript: "^5.4.0"
      }
    };

    writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );

    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        outDir: "./dist",
        types: ["node"]
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"]
    };

    writeFileSync(
      path.join(projectPath, "tsconfig.json"),
      JSON.stringify(tsconfig, null, 2)
    );

    const gitignore = await fetch(
      "https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore"
    );
    const gitignoreText = await gitignore.text();
    writeFileSync(path.join(projectPath, ".gitignore"), gitignoreText);

    const envContent = modelProviders.includes("@maiar-ai/model-openai")
      ? `OPENAI_API_KEY=${openaiApiKey}\n`
      : "";

    writeFileSync(path.join(projectPath, ".env"), envContent);

    mkdirSync(path.join(projectPath, "src"), { recursive: true });

    writeFileSync(
      path.join(projectPath, "src", "index.ts"),
      new EntrypointBuilder(modelProviders, memoryProvider, plugins).build()
    );

    const installDependencies = await prompts.select({
      message: "📦 Install dependencies?",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false }
      ]
    });

    if (prompts.isCancel(installDependencies)) return cancel();

    if (installDependencies) {
      const spinner = prompts.spinner();
      spinner.start("📦 Installing dependencies...");
      execSync("npm i", { cwd: projectPath });
      execSync("npm i dotenv", { cwd: projectPath });
      execSync("npm i -D @types/node", { cwd: projectPath });
      execSync("npm i -D typescript", { cwd: projectPath });
      spinner.stop("Dependencies installed");
    }

    prompts.outro("Maiar project created successfully 🎉");
    console.log("Now run:\n");
    console.log(`cd ${projectName}`);
    if (!installDependencies) console.log(`npm install`);
    console.log(`npm start`);
  });

program.parse();
