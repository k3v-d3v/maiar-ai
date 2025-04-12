import { AgentContext, Executor, PluginResult, Runtime } from "@maiar-ai/core";

import { XService } from "./services";
import { generateTweetTemplate } from "./templates";
import { PostTweetSchema, TweetOptions, XExecutorFactory } from "./types";

/**
 * Helper to create a simple executor with name, description, and execute function
 * The execute function will receive context, xService, and runtime
 */
export function xExecutorFactory(
  name: string,
  description: string,
  execute: (
    context: AgentContext,
    service: XService,
    runtime: Runtime
  ) => Promise<PluginResult>
): XExecutorFactory {
  return (service: XService, getRuntime: () => Runtime): Executor => ({
    name,
    description,
    fn: (context: AgentContext) => {
      const runtime = getRuntime();
      return execute(context, service, runtime);
    }
  });
}

/**
 * Default executor for creating a new post on X (Twitter)
 * This executor extracts text from the user input and creates a new post
 */
export const createPostExecutor = xExecutorFactory(
  "post_tweet",
  "Post a tweet on X (Twitter)",
  async (
    context: AgentContext,
    xService: XService,
    runtime: Runtime
  ): Promise<PluginResult> => {
    try {
      const tweetTemplate = generateTweetTemplate(context.contextChain);
      const params = await runtime.operations.getObject(
        PostTweetSchema,
        tweetTemplate
      );
      const message = params.tweetText;
      // Post the tweet
      const options: TweetOptions = {
        text: message
      };

      const result = await xService.postTweet(options);

      if (!result) {
        return {
          success: false,
          error: "Failed to post tweet"
        };
      }

      return {
        success: true,
        data: {
          tweet_id: result.id,
          tweet_url: `https://x.com/i/status/${result.id}`,
          text: result.text
        }
      };
    } catch (error) {
      return {
        success: false,
        error: String(error)
      };
    }
  }
);
