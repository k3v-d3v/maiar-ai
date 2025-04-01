import { Logger } from "winston";

import logger from "../../lib/logger";
import { BaseContextItem } from "../pipeline/agent";
import {
  Context,
  Conversation,
  MemoryProvider,
  MemoryQueryOptions,
  Message
} from "../providers/memory";

/**
 * MemoryManager is responsbile delegating memory operations to the MemoryProvider
 */
export class MemoryManager {
  private provider: MemoryProvider;

  public get logger(): Logger {
    return logger.child({ scope: "memory.manager" });
  }

  constructor(provider: MemoryProvider) {
    this.provider = provider;
  }

  /**
   * Generate a deterministic conversation ID based on user and platform
   */
  private generateConversationId(user: string, platform: string): string {
    return `${platform}-${user}`;
  }

  /**
   * Store a user interaction in memory
   */
  public async storeUserInteraction(
    user: string,
    platform: string,
    message: string,
    timestamp: number,
    messageId?: string
  ): Promise<void> {
    try {
      this.logger.info("storing user interaction", {
        type: "memory.user.interaction.storing",
        user,
        platform,
        message,
        messageId
      });

      const conversationId = await this.getOrCreateConversation(user, platform);

      this.logger.info("got conversation ID", {
        type: "memory.conversation.retrieved",
        conversationId,
        user,
        platform
      });

      // Use provided messageId or generate one
      const finalMessageId = messageId || `${platform}-${timestamp}`;

      this.logger.info("using message ID", {
        type: "memory.message.id.generated",
        messageId: finalMessageId,
        wasProvided: !!messageId
      });

      // Store the user's message
      await this.storeMessage(
        {
          id: finalMessageId,
          role: "user",
          content: message,
          timestamp
        },
        conversationId
      );

      this.logger.info("stored user message", {
        type: "memory.message.stored",
        messageId: finalMessageId,
        conversationId
      });
    } catch (error) {
      this.logger.error("failed to store user interaction", {
        type: "memory.user.interaction.failed",
        error: error instanceof Error ? error.message : String(error),
        user,
        platform
      });
      throw error;
    }
  }

  /**
   * Store an assistant interaction and its context in memory
   */
  public async storeAssistantInteraction(
    user: string,
    platform: string,
    response: string,
    contextChain: BaseContextItem[]
  ): Promise<void> {
    try {
      this.logger.info("storing assistant interaction", {
        type: "memory.assistant.interaction.storing",
        user,
        platform,
        response
      });

      const conversationId = await this.getOrCreateConversation(user, platform);

      this.logger.info("got conversation ID", {
        type: "memory.conversation.retrieved",
        conversationId,
        user,
        platform
      });

      const timestamp = Date.now();
      const contextId = `${conversationId}-context-${timestamp}`;
      const messageId = `${conversationId}-assistant-${timestamp}`;

      // Get the user's message ID from the context chain
      const userMessage = contextChain[0];

      this.logger.info("context chain user message", {
        type: "memory.context.chain.processing",
        userMessage,
        contextChain: JSON.stringify(contextChain)
      });

      if (!userMessage?.id) {
        throw new Error("No user message ID found in context chain");
      }

      const userMessageId = userMessage.id;

      this.logger.info("using user message ID from context chain", {
        type: "memory.message.id.extracted",
        userMessageId
      });

      // Store the context chain first
      await this.storeContext(
        {
          id: contextId,
          type: "context_chain",
          content: JSON.stringify(contextChain),
          timestamp
        },
        conversationId
      );

      this.logger.info("stored context", {
        type: "memory.context.stored",
        contextId,
        conversationId
      });

      // Then store the assistant's response with reference to the context and user message
      await this.storeMessage(
        {
          id: messageId,
          role: "assistant",
          content: response,
          timestamp,
          contextId: contextId,
          user_message_id: userMessageId
        },
        conversationId
      );

      this.logger.info(
        "stored assistant interaction and context successfully",
        {
          type: "memory.assistant.interaction.completed",
          messageId,
          contextId,
          conversationId
        }
      );
    } catch (error) {
      this.logger.error("failed to store assistant interaction", {
        type: "memory.assistant.interaction.failed",
        error: error instanceof Error ? error.message : String(error),
        user,
        platform
      });
      throw error;
    }
  }

  public async storeMessage(
    message: Message,
    conversationId: string
  ): Promise<void> {
    this.logger.info("storing message", {
      type: "store_message.called",
      conversationId,
      message
    });
    return this.provider.storeMessage(message, conversationId);
  }

  public async storeContext(
    context: Context,
    conversationId: string
  ): Promise<void> {
    this.logger.info("storing context", {
      type: "store_context.called",
      conversationId,
      context
    });
    return this.provider.storeContext(context, conversationId);
  }

  public async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    this.logger.info("getting messages", {
      type: "get_messages.called",
      options
    });
    return this.provider.getMessages(options);
  }

  public async getContexts(conversationId: string): Promise<Context[]> {
    this.logger.info("getting contexts", {
      type: "get_contexts.called",
      conversationId
    });
    return this.provider.getContexts(conversationId);
  }

  public async getConversation(conversationId: string): Promise<Conversation> {
    this.logger.info("getting conversation", {
      type: "get_conversation.called",
      conversationId
    });
    return this.provider.getConversation(conversationId);
  }

  public async createConversation(options?: {
    id?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  }): Promise<string> {
    this.logger.info("creating conversation", {
      type: "create_conversation.called",
      options
    });
    return this.provider.createConversation(options);
  }

  public async deleteConversation(conversationId: string): Promise<void> {
    this.logger.info("deleting conversation", {
      type: "delete_conversation.called",
      conversationId
    });
    return this.provider.deleteConversation(conversationId);
  }

  /**
   * Get or create a conversation for a user on a platform
   */
  public async getOrCreateConversation(
    user: string,
    platform: string
  ): Promise<string> {
    const conversationId = this.generateConversationId(user, platform);
    try {
      await this.getConversation(conversationId);
      return conversationId;
    } catch {
      // Conversation doesn't exist, create it
      await this.createConversation({ id: conversationId });
      return conversationId;
    }
  }

  /**
   * Get recent conversation history for a user/platform
   */
  public async getRecentConversationHistory(
    user: string,
    platform: string,
    limit: number = 100
  ): Promise<{ role: string; content: string; timestamp: number }[]> {
    try {
      const conversationId = this.generateConversationId(user, platform);
      const messages = await this.getMessages({
        conversationId,
        limit
      });

      return messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }));
    } catch (error) {
      this.logger.error("failed to get conversation history", {
        type: "memory.conversation.history.failed",
        error: error instanceof Error ? error.message : String(error),
        user,
        platform
      });
      return [];
    }
  }
}
