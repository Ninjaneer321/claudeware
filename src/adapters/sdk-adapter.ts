import { query as sdkQuery, ClaudeCodeOptions, Message, TextBlock } from '@instantlyeasy/claude-code-sdk-ts';
import { EventBus, EventMetrics } from '../plugins/event-bus';
import { PluginLoader, PluginMetrics } from '../plugins/plugin-loader';
import { PluginContext, QueryEvent, DataStore, QueryRecord, ResponseRecord } from '../types';
import { SqliteAdapter } from '../database/sqlite-adapter';
import { BatchQueue, BatchMetrics } from '../database/batch-queue';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

/**
 * Adapter that bridges the Claude Code SDK with the wrapper's plugin system.
 * This allows SDK-based applications to benefit from all wrapper plugins.
 */
export class SDKWrapperAdapter {
  private eventBus: EventBus;
  private pluginLoader!: PluginLoader;
  private dataStore!: DataStore;
  private batchQueue!: BatchQueue<QueryRecord | ResponseRecord>;
  private logger: pino.Logger;
  private sessionId: string;
  private initialized: boolean = false;

  constructor(private config: {
    pluginDirectory?: string;
    databasePath?: string;
    enabledPlugins?: string[];
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  } = {}) {
    this.sessionId = uuidv4();
    this.logger = pino({
      level: config.logLevel || 'info',
      name: 'sdk-wrapper-adapter'
    });
    this.eventBus = new EventBus();
  }

  /**
   * Initialize the adapter and load plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize database
    this.dataStore = new SqliteAdapter({
      path: this.config.databasePath || './claude-queries.db'
    });
    await this.dataStore.init();

    // Initialize batch queue for database writes
    this.batchQueue = new BatchQueue({
      batchSize: 50,
      flushInterval: 1000,
      handler: async (batch) => {
        await this.dataStore.batchSave(batch);
      }
    });

    // Create plugin context
    const pluginContext: PluginContext = {
      eventBus: this.eventBus,
      dataStore: this.dataStore,
      logger: this.logger.child({ component: 'plugin' }),
      config: {},
      sharedState: new Map()
    };

    // Initialize plugin loader
    this.pluginLoader = new PluginLoader(pluginContext);

    // Load plugins
    if (this.config.pluginDirectory) {
      const plugins = await this.pluginLoader.loadPlugins(this.config.pluginDirectory);

      // Filter enabled plugins if specified
      const enabledPlugins = this.config.enabledPlugins
        ? plugins.filter(p => this.config.enabledPlugins!.includes(p.name))
        : plugins;

      // Initialize each plugin
      for (const plugin of enabledPlugins) {
        try {
          await this.pluginLoader.initializePlugin(plugin);
          this.logger.info({ plugin: plugin.name }, 'Plugin initialized');
        } catch (error) {
          this.logger.error({ plugin: plugin.name, error }, 'Failed to initialize plugin');
        }
      }
    }

    this.initialized = true;
    this.logger.info('SDK Wrapper Adapter initialized');
  }

  /**
   * Enhanced query function that integrates with the plugin system
   */
  async *query(
    prompt: string,
    options?: ClaudeCodeOptions
  ): AsyncGenerator<Message> {
    // Ensure initialized
    await this.initialize();

    const queryId = uuidv4();
    const correlationId = uuidv4();
    const startTime = Date.now();

    try {
      // Emit pre-query event
      const queryEvent: QueryEvent = {
        id: queryId,
        type: 'query',
        timestamp: startTime,
        data: {
          messages: [{ role: 'user', content: prompt }],
          model: options?.model || 'opus',
          options
        },
        metadata: {
          correlationId,
          sessionId: this.sessionId,
          timestamp: startTime,
          source: 'sdk'
        }
      };

      await this.pluginLoader.executePlugins(queryEvent);

      // Execute original SDK query
      let responseText = '';
      let tokenUsage: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; } | undefined;

      for await (const message of sdkQuery(prompt, options)) {
        // Collect response content
        if (message.type === 'assistant') {
          const textContent = message.content
            .filter(block => block.type === 'text')
            .map(block => (block as TextBlock).text)
            .join('\n');
          responseText += textContent;
        }

        // Collect usage stats
        if (message.type === 'result' && message.usage) {
          tokenUsage = message.usage;
        }

        // Emit response event
        const responseEvent: QueryEvent = {
          id: uuidv4(),
          type: 'response',
          timestamp: Date.now(),
          data: {
            ...message,
            queryId,
            latencyMs: Date.now() - startTime
          },
          metadata: {
            correlationId,
            sessionId: this.sessionId,
            timestamp: Date.now(),
            source: 'sdk'
          }
        };

        await this.pluginLoader.executePlugins(responseEvent);

        // Yield the message to the caller
        yield message;
      }

      // Emit completion event with full context
      const completionEvent: QueryEvent = {
        id: uuidv4(),
        type: 'response',
        timestamp: Date.now(),
        data: {
          id: uuidv4(),
          model: options?.model || 'opus',
          usage: tokenUsage,
          content: [{ type: 'text', text: responseText }],
          stop_reason: 'end_turn',
          queryId,
          latencyMs: Date.now() - startTime
        },
        metadata: {
          correlationId,
          sessionId: this.sessionId,
          timestamp: Date.now(),
          source: 'sdk'
        }
      };

      await this.pluginLoader.executePlugins(completionEvent);

    } catch (error) {
      // Emit error event
      const errorEvent: QueryEvent = {
        id: uuidv4(),
        type: 'error',
        timestamp: Date.now(),
        data: {
          error: {
            type: (error as Error).name || 'Unknown',
            message: (error as Error).message || 'Unknown error',
            stack: (error as Error).stack
          }
        },
        metadata: {
          correlationId,
          sessionId: this.sessionId,
          timestamp: Date.now(),
          source: 'sdk'
        }
      };

      await this.pluginLoader.executePlugins(errorEvent);
      throw error;
    }
  }

  /**
   * Create a wrapped version of the SDK query function
   */
  createWrappedQuery() {
    return this.query.bind(this);
  }

  /**
   * Get metrics from all plugins
   */
  async getMetrics(): Promise<{
    eventBus: EventMetrics;
    batchQueue: BatchMetrics;
    plugins: PluginMetrics[];
  }> {
    return {
      eventBus: this.eventBus.getMetrics(),
      batchQueue: this.batchQueue.getMetrics(),
      plugins: await this.pluginLoader.getPluginMetrics()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down SDK Wrapper Adapter');

    // Shutdown plugins
    await this.pluginLoader.shutdown();

    // Flush batch queue
    await this.batchQueue.stop();

    // Close database
    await this.dataStore.close();

    this.initialized = false;
  }
}

/**
 * Factory function to create a wrapped SDK with plugin support
 */
export function createWrappedSDK(config?: {
  pluginDirectory?: string;
  databasePath?: string;
  enabledPlugins?: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}): {
  query: (prompt: string, options?: ClaudeCodeOptions) => AsyncIterable<Message>;
  getMetrics: () => Promise<{
    eventBus: EventMetrics;
    batchQueue: BatchMetrics;
    plugins: PluginMetrics[];
  }>;
  shutdown: () => Promise<void>;
} {
  const adapter = new SDKWrapperAdapter(config);

  return {
    query: adapter.createWrappedQuery(),
    getMetrics: () => adapter.getMetrics(),
    shutdown: () => adapter.shutdown()
  };
}