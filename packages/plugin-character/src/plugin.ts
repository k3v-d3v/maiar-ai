import { Plugin, PluginResult } from "@maiar-ai/core";

import { CharacterPluginConfig } from "./types";

export class CharacterPlugin extends Plugin {
  private character: string;

  constructor(config: CharacterPluginConfig) {
    super({
      id: "plugin-character",
      name: "Character",
      description: "Handles character related context injection for the agent",
      requiredCapabilities: []
    });
    this.character = config.character;

    this.executors = [
      {
        name: "inject_character",
        description:
          "Inject the character information into the context. This plugin must be run first every single time a pipeline is constructed no matter what. The purpose is to inform you on how you should respond by acting like the agent based on the character instructions.",
        fn: this.injectCharacter.bind(this)
      }
    ];
  }

  private async injectCharacter(): Promise<PluginResult> {
    this.logger.info("character information injected into context", {
      type: "plugin.character.context.inject",
      character: this.character
    });

    return {
      success: true,
      data: {
        character: this.character,
        helpfulInstruction:
          "This is information about your personality. You will use this when constructing final outputs that will be read by users."
      }
    };
  }

  public async init(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}
