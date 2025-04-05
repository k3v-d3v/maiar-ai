import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import {
  Context,
  Conversation,
  MemoryProvider,
  MemoryQueryOptions,
  Message,
  Plugin
} from "@maiar-ai/core";

import { SQLiteDatabase } from "./database";
import { SQLiteMemoryPlugin } from "./plugin";
import { SQLiteConfig } from "./types";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export class SQLiteMemoryProvider extends MemoryProvider {
  private config: SQLiteConfig;
  private db: Database.Database;
  private plugin: SQLiteMemoryPlugin;

  constructor(config: SQLiteConfig) {
    super({
      id: "sqlite",
      name: "SQLite Memory",
      description: "Stores conversations in a SQLite database"
    });
    this.config = config;
    const dbDir = path.dirname(this.config.dbPath);
    fs.mkdirSync(dbDir, { recursive: true });
    SQLiteDatabase.getInstance().init(this.config);
    this.db = SQLiteDatabase.getInstance().getDatabase();
    this.plugin = new SQLiteMemoryPlugin();
  }

  public init(): void {
    this.initializeStorage();
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  public checkHealth(): void {
    try {
      this.db.prepare("SELECT 1").get();
      this.db.transaction(() => {})();
      const fkEnabled = this.db.prepare("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
      };
      if (!fkEnabled || !fkEnabled.foreign_keys) {
        throw new Error("Foreign key constraints are not enabled");
      }
      this.logger.info("sqlite health check passed", {
        type: "memory.sqlite.health_check"
      });
    } catch (error) {
      this.logger.error("sqlite health check failed", {
        type: "memory.sqlite.health_check.failed",
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(
        `Failed to initialize SQLite database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public shutdown(): void {
    this.db.close();
  }

  private initializeStorage() {
    this.createTables().then(() => {
      this.logger.info("initialized sqlite memory storage", {
        type: "memory.sqlite.storage.initialized"
      });
    });
  }

  private async createTables(): Promise<void> {
    await this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                user TEXT NOT NULL,
                platform TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                context_id TEXT,
                user_message_id TEXT,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id),
                FOREIGN KEY (context_id) REFERENCES contexts(id),
                FOREIGN KEY (user_message_id) REFERENCES messages(id)
            );

            CREATE TABLE IF NOT EXISTS contexts (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            );
        `);
  }

  public getPlugin(): Plugin {
    return this.plugin;
  }

  async createConversation(options?: {
    id?: string;
    metadata?: Record<string, JSONValue>;
  }): Promise<string> {
    const stmt = this.db.prepare(
      "INSERT INTO conversations (id, user, platform, created_at) VALUES (?, ?, ?, ?)"
    );
    const id = options?.id || Math.random().toString(36).substring(2);
    const [user, platform] = id.split("-");
    const timestamp = Date.now();

    this.logger.info("creating new conversation", {
      type: "memory.sqlite.conversation.creating",
      conversationId: id
    });

    try {
      stmt.run(id, user, platform, timestamp);
      this.logger.info("created conversation successfully", {
        type: "memory.sqlite.conversation.created",
        conversationId: id
      });
      return id;
    } catch (error) {
      this.logger.error("failed to create conversation", {
        type: "memory.sqlite.conversation.creation_failed",
        conversationId: id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async storeMessage(message: Message, conversationId: string): Promise<void> {
    const stmt = this.db.prepare(`
            INSERT INTO messages (id, conversation_id, role, content, timestamp, context_id, user_message_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
    stmt.run(
      message.id,
      conversationId,
      message.role,
      message.content,
      message.timestamp,
      message.contextId,
      message.user_message_id
    );
  }

  async storeContext(context: Context, conversationId: string): Promise<void> {
    const stmt = this.db.prepare(`
            INSERT INTO contexts (id, conversation_id, type, content, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `);
    stmt.run(
      context.id,
      conversationId,
      context.type,
      context.content,
      context.timestamp
    );
  }

  async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    if (!options.conversationId) {
      throw new Error("Conversation ID is required for SQLite memory provider");
    }

    let query = "SELECT * FROM messages WHERE conversation_id = ?";
    const params: (string | number)[] = [options.conversationId];

    if (options.after) {
      query += " AND timestamp > ?";
      params.push(options.after);
    }

    if (options.before) {
      query += " AND timestamp < ?";
      params.push(options.before);
    }

    query += " ORDER BY timestamp DESC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Message[];
  }

  async getContexts(conversationId: string): Promise<Context[]> {
    const stmt = this.db.prepare(
      "SELECT * FROM contexts WHERE conversation_id = ?"
    );
    return stmt.all(conversationId) as Context[];
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    this.logger.info("fetching conversation", {
      type: "memory.sqlite.conversation.fetching",
      conversationId
    });

    const conversationStmt = this.db.prepare(
      "SELECT * FROM conversations WHERE id = ?"
    );
    const conversation = conversationStmt.get(conversationId) as {
      id: string;
      metadata: string | null;
    };

    if (!conversation) {
      this.logger.error("conversation not found", {
        type: "memory.sqlite.conversation.not_found",
        conversationId
      });
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = await this.getMessages({ conversationId });
    const contexts = await this.getContexts(conversationId);

    this.logger.info("retrieved conversation", {
      type: "memory.sqlite.conversation.retrieved",
      conversationId,
      messageCount: messages.length,
      contextCount: contexts.length
    });

    return {
      id: conversationId,
      messages,
      contexts,
      metadata: conversation.metadata
        ? JSON.parse(conversation.metadata)
        : undefined
    };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const deleteMessages = this.db.prepare(
      "DELETE FROM messages WHERE conversation_id = ?"
    );
    const deleteContexts = this.db.prepare(
      "DELETE FROM contexts WHERE conversation_id = ?"
    );
    const deleteConversation = this.db.prepare(
      "DELETE FROM conversations WHERE id = ?"
    );

    const transaction = this.db.transaction(() => {
      deleteMessages.run(conversationId);
      deleteContexts.run(conversationId);
      deleteConversation.run(conversationId);
    });

    try {
      transaction();
    } catch (error) {
      this.logger.error("failed to delete conversation", {
        type: "memory.sqlite.conversation.deletion_failed",
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
