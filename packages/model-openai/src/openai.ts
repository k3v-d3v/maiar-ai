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
    super({
      id: PROVIDER_ID,
      name: PROVIDER_NAME,
      description: PROVIDER_DESCRIPTION
    });
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

      this.logger.info("add text generation capability", {
        type: "openai.model.capability.registration",
        model: this.id,
        capability: "text-generation",
        inputSchema: textGenerationSchema.input,
        outputSchema: textGenerationSchema.output
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

      this.logger.info("add image generation capability", {
        type: "openai.model.capability.registration",
        model: this.id,
        capability: "image-generation",
        inputSchema: imageGenerationSchema.input,
        outputSchema: imageGenerationSchema.output
      });
    }
  }

  public async init(): Promise<void> {}

  public async checkHealth(): Promise<void> {
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

  public async shutdown(): Promise<void> {}

  public async generateImage(
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

    return filteredUrls;
  }

  public async generateText(
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

      // Log the interaction
      this.logger.info({
        type: "model.provider.interaction",
        message: `model provider ${this.id} executed capability text-generation`,
        metadata: {
          modelId: this.id,
          capabilityId: "text-generation",
          input: prompt,
          output: content
        }
      });

      return content;
    } catch (error) {
      this.logger.error("error executing capability text-generation on model", {
        type: "model_error",
        modelId: this.id,
        capabilityId: "text-generation",
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }
}
