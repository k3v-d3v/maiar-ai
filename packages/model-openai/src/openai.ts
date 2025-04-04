import OpenAI from "openai";
import { z } from "zod";

import { ModelProvider, ModelRequestConfig } from "@maiar-ai/core";

import {
  imageGenerationSchema,
  OpenAIConfig,
  OpenAIImageGenerationModel,
  OpenAIModel,
  OpenAIModelRequestConfig,
  OpenAITextGenerationModel,
  textGenerationSchema
} from "./types";
import {
  IMAGE_GENERATION_CAPABILITY_ID,
  TEXT_GENERATION_CAPABILITY_ID
} from "./types";

// Helper functions to check model types
const isTextGenerationModel = (
  model: OpenAIModel
): model is OpenAITextGenerationModel => {
  return Object.values(OpenAITextGenerationModel).includes(
    model as OpenAITextGenerationModel
  );
};

const isImageGenerationModel = (
  model: OpenAIModel
): model is OpenAIImageGenerationModel => {
  return Object.values(OpenAIImageGenerationModel).includes(
    model as OpenAIImageGenerationModel
  );
};

// Constants for provider information
const PROVIDER_ID = "openai";
const PROVIDER_NAME = "OpenAI";
const PROVIDER_DESCRIPTION = "OpenAI API models like GPT-4 and GPT-3.5";

export class OpenAIModelProvider extends ModelProvider {
  private client: OpenAI;
  private models: OpenAIModel[];

  constructor(config: OpenAIConfig) {
    super(PROVIDER_ID, PROVIDER_NAME, PROVIDER_DESCRIPTION);
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.models = config.models;

    if (this.models.some(isTextGenerationModel)) {
      this.addCapability({
        id: TEXT_GENERATION_CAPABILITY_ID,
        name: "Text generation capability",
        description: "Generate text completions from prompts",
        input: textGenerationSchema.input,
        output: textGenerationSchema.output,
        execute: this.generateText.bind(this)
      });
    }

    if (this.models.some(isImageGenerationModel)) {
      this.addCapability({
        id: IMAGE_GENERATION_CAPABILITY_ID,
        name: "Image generation capability",
        description: "Generate images from prompts",
        input: imageGenerationSchema.input,
        output: imageGenerationSchema.output,
        execute: this.generateImage.bind(this)
      });
    }
  }

  async generateImage(
    prompt: string,
    config?: OpenAIModelRequestConfig
  ): Promise<z.infer<typeof imageGenerationSchema.output>> {
    const response = await this.client.images.generate({
      prompt: prompt,
      n: config?.n ?? 1,
      size: config?.size ?? "1024x1024"
    });

    if (response.data.length !== (config?.n ?? 1)) {
      throw new Error("Unexpected number of images generated");
    }

    const urls = response.data.map((image) => image.url).filter(Boolean);
    const filteredUrls = urls.filter((url) => url !== undefined);

    if (filteredUrls.length === 0) {
      throw new Error("No valid image URLs generated");
    }

    this.logger.info(
      `model provider "${this.id}" executed capability ${IMAGE_GENERATION_CAPABILITY_ID}`,
      {
        modelProvider: this.id,
        capabilityId: IMAGE_GENERATION_CAPABILITY_ID,
        input: prompt,
        output: filteredUrls
      }
    );

    return filteredUrls;
  }

  async generateText(
    prompt: string,
    config?: ModelRequestConfig
  ): Promise<z.infer<typeof textGenerationSchema.output>> {
    try {
      const textModel = this.models.find(isTextGenerationModel);

      if (!textModel) {
        throw new Error("No text generation model configured");
      }

      const completion = await this.client.chat.completions.create({
        model: textModel,
        messages: [{ role: "user", content: prompt }],
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens,
        stop: config?.stopSequences
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content in response");
      }

      this.logger.info(
        `model provider "${this.id}" executed capability ${TEXT_GENERATION_CAPABILITY_ID}`,
        {
          modelProvider: this.id,
          capabilityId: TEXT_GENERATION_CAPABILITY_ID,
          input: prompt,
          output: content
        }
      );

      return content;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `error executing capability ${TEXT_GENERATION_CAPABILITY_ID} on model ${this.id}`,
        {
          modelProvider: this.id,
          capabilityId: TEXT_GENERATION_CAPABILITY_ID,
          error: error.message
        }
      );
      throw error;
    }
  }

  async init(): Promise<void> {
    // Nothing to init
  }

  async checkHealth(): Promise<void> {
    // Verifying if we can call the API
    try {
      await this.executeCapability(
        TEXT_GENERATION_CAPABILITY_ID,
        "[SYSTEM HEALTH CHECK] are you alive? please response with 'yes' only",
        {
          temperature: 0.7,
          maxTokens: 5
        }
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(
        `health check failed for model provider ${this.id}: ${error.message}`
      );
    }
  }
}
