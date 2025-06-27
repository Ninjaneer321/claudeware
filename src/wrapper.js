/**
 * Claudeware
 * 
 * Main orchestrator class that coordinates all components to provide
 * zero-latency stream passthrough with plugin-based data collection.
 */

// For testing, we'll create mock implementations
// In production, these would come from the compiled TypeScript files

// Mock implementations for testing
const { EventEmitter } = require('events');

class ProcessManager {
  spawn(command, args) {
    const { spawn } = require('child_process');
    this.child = spawn(command, args, { stdio: 'pipe' });
    return this.child;
  }
  
  onExit(callback) {
    if (this.child) this.child.on('exit', callback);
  }
  
  onError(callback) {
    if (this.child) this.child.on('error', callback);
  }
  
  async gracefulShutdown(timeout) {
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
  }
}

class StreamHandler {
  constructor(eventBus, parser) {
    this.eventBus = eventBus;
    this.parser = parser;
    this.metrics = { bytesProcessed: 0 };
  }
  
  setupPassthrough(source, destination) {
    source.pipe(destination);
  }
  
  setupProcessing(source) {
    source.on('data', (chunk) => {
      this.metrics.bytesProcessed += chunk.length;
      try {
        const objects = this.parser.parse(chunk);
        objects.forEach(obj => {
          this.eventBus.emit(obj.type || 'data', obj);
        });
      } catch (error) {
        // Ignore parse errors
      }
    });
  }
  
  getMetrics() {
    return this.metrics;
  }
  
  cleanup() {
    // Cleanup
  }
}

class JsonStreamParser {
  constructor() {
    this.buffer = '';
  }
  
  parse(chunk) {
    this.buffer += chunk.toString();
    const results = [];
    
    // Try to parse complete JSON objects
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const obj = JSON.parse(line);
          results.push(obj);
        } catch {
          // Not valid JSON, ignore
        }
      }
    }
    
    return results;
  }
}

class EventBus extends EventEmitter {
  getMetrics() {
    return { totalEvents: 0 };
  }
}

class PluginLoader {
  constructor(context) {
    this.context = context;
    this.plugins = [];
  }
  
  async loadPlugins(directory) {
    // For testing, return empty array
    return [];
  }
  
  async shutdown() {
    // Shutdown plugins
  }
  
  getPluginMetrics() {
    return [];
  }
}

class SqliteAdapter {
  constructor(config) {
    this.config = config;
  }
  
  async init() {
    // Initialize database
  }
  
  async close() {
    // Close database
  }
  
  async batchSave(records) {
    // Save records
  }
}

class BatchQueue extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.queue = [];
  }
  
  add(item) {
    this.queue.push(item);
  }
  
  async stop() {
    if (this.queue.length > 0 && this.options.handler) {
      await this.options.handler(this.queue);
    }
  }
  
  getMetrics() {
    return { pending: this.queue.length };
  }
}
const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;

class ClaudeWrapper {
  constructor(config) {
    this.config = this.validateConfig(config);
    this.components = {};
    this.initialized = false;
    this.metrics = {
      startTime: Date.now(),
      eventsProcessed: 0,
      bytesProcessed: 0,
      errors: 0
    };
  }

  validateConfig(config) {
    // Ensure required fields
    if (!config.claudePath) {
      throw new Error('claudePath is required in configuration');
    }

    // Set defaults for missing fields
    const defaults = {
      mode: 'production',
      wrapper: {
        timeout: 300000,
        bufferSize: 65536,
        gracefulShutdownTimeout: 5000
      },
      plugins: {
        directory: '~/.claude-code/plugins',
        timeout: 5000,
        enabledPlugins: [],
        disabledPlugins: []
      },
      database: {
        type: 'sqlite',
        path: '~/.claude-code/queries.db',
        batchSize: 100,
        flushInterval: 1000,
        walMode: true
      },
      monitoring: {
        enabled: true,
        logLevel: 'info'
      }
    };

    // Deep merge with defaults
    return this.deepMerge(defaults, config);
  }

  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  async initialize() {
    if (this.initialized) return;

    // Create logger
    this.logger = this.createLogger();
    this.logger.info('Initializing Claudeware', {
      mode: this.config.mode,
      claudePath: this.config.claudePath
    });

    // Create event bus
    this.components.eventBus = new EventBus();

    // Create database adapter
    this.components.dataStore = new SqliteAdapter(this.config.database);
    await this.components.dataStore.init();

    // Create batch queue for database writes
    this.components.batchQueue = new BatchQueue({
      batchSize: this.config.database.batchSize,
      flushInterval: this.config.database.flushInterval,
      handler: async (batch) => {
        await this.components.dataStore.batchSave(batch);
      },
      onError: (error, batch) => {
        this.logger.error('Batch save failed', { error: error.message, batchSize: batch.length });
      }
    });

    // Create plugin context
    const pluginContext = {
      eventBus: this.components.eventBus,
      dataStore: this.components.dataStore,
      logger: this.logger,
      config: {},
      sharedState: new Map()
    };

    // Create plugin loader
    this.components.pluginLoader = new PluginLoader(pluginContext);

    // Load plugins
    if (this.config.plugins.directory) {
      const pluginDir = this.expandPath(this.config.plugins.directory);
      await this.ensureDirectory(pluginDir);
      
      const plugins = await this.components.pluginLoader.loadPlugins(pluginDir);
      this.logger.info(`Loaded ${plugins.length} plugins`, {
        plugins: plugins.map(p => p.name)
      });
    }

    // Create core components
    this.components.jsonParser = new JsonStreamParser();
    this.components.processManager = new ProcessManager();
    this.components.streamHandler = new StreamHandler(
      this.components.eventBus,
      this.components.jsonParser
    );

    // Set up event handlers
    this.setupEventHandlers();

    this.initialized = true;
    this.logger.info('Wrapper initialized successfully');
  }

  createLogger() {
    const logDir = path.dirname(this.config.monitoring.logPath || './wrapper.log');
    
    const transports = [];

    // Console transport for development/debug
    if (this.config.mode === 'development' || this.config.monitoring.logLevel === 'debug') {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    // File transport if path specified
    if (this.config.monitoring.logPath && this.config.mode !== 'test') {
      transports.push(new winston.transports.File({
        filename: this.expandPath(this.config.monitoring.logPath),
        format: winston.format.json()
      }));
    }

    return winston.createLogger({
      level: this.config.monitoring.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'claude-wrapper' },
      transports
    });
  }

  setupEventHandlers() {
    // Track metrics
    this.components.eventBus.on('*', (event) => {
      this.metrics.eventsProcessed++;
    });

    // Handle queries
    this.components.eventBus.on('query', async (event) => {
      try {
        const queryRecord = {
          id: event.id,
          sessionId: event.metadata.sessionId,
          timestamp: Math.floor(event.timestamp / 1000),
          query: event.data.messages?.[0]?.content || '',
          model: event.data.model,
          category: event.data.category,
          complexity: event.data.complexity,
          tokenCount: event.data.tokenCount,
          metadata: event.metadata
        };

        this.components.batchQueue.add(queryRecord);
      } catch (error) {
        this.logger.error('Failed to process query event', { error: error.message });
        this.metrics.errors++;
      }
    });

    // Handle responses
    this.components.eventBus.on('response', async (event) => {
      try {
        const responseRecord = {
          id: event.id,
          queryId: event.metadata.queryId,
          sessionId: event.metadata.sessionId,
          timestamp: Math.floor(event.timestamp / 1000),
          response: event.data.content || '',
          model: event.data.model,
          inputTokens: event.data.usage?.input_tokens,
          outputTokens: event.data.usage?.output_tokens,
          latencyMs: event.metadata.latencyMs,
          finishReason: event.data.finish_reason,
          error: event.data.error
        };

        this.components.batchQueue.add(responseRecord);
      } catch (error) {
        this.logger.error('Failed to process response event', { error: error.message });
        this.metrics.errors++;
      }
    });

    // Handle errors
    this.components.eventBus.on('error', (event) => {
      this.logger.error('Error event received', {
        error: event.data.error,
        metadata: event.metadata
      });
      this.metrics.errors++;
    });
  }

  async start(args, stdin, stdout, stderr) {
    await this.initialize();

    const startTime = Date.now();
    this.logger.info('Starting Claudeware', { args });

    try {
      // Spawn Claude process
      const claudeArgs = this.config.claudeArgs || args;
      const child = this.components.processManager.spawn(
        this.config.claudePath,
        claudeArgs,
        {
          ...process.env,
          // Any Claude-specific environment variables
        }
      );

      // Set up stream passthrough (zero-latency)
      this.components.streamHandler.setupPassthrough(child.stdout, stdout);
      this.components.streamHandler.setupPassthrough(child.stderr, stderr);
      this.components.streamHandler.setupPassthrough(stdin, child.stdin);

      // Set up processing (parallel, non-blocking)
      this.components.streamHandler.setupProcessing(child.stdout);
      this.components.streamHandler.setupProcessing(child.stderr);

      // Handle process events
      this.components.processManager.onExit((code, signal) => {
        this.logger.info('Claude process exited', { code, signal });
        this.shutdown();
      });

      this.components.processManager.onError((error) => {
        this.logger.error('Claude process error', { error: error.message });
        this.metrics.errors++;
      });

      // Track startup time
      const startupTime = Date.now() - startTime;
      this.logger.info('Wrapper started successfully', { startupTime });

    } catch (error) {
      this.logger.error('Failed to start wrapper', { error: error.message });
      throw error;
    }
  }

  async shutdown() {
    this.logger.info('Shutting down wrapper', {
      eventsProcessed: this.metrics.eventsProcessed,
      errors: this.metrics.errors,
      uptime: Date.now() - this.metrics.startTime
    });

    try {
      // Stop accepting new events
      this.components.eventBus.removeAllListeners();

      // Flush batch queue
      if (this.components.batchQueue) {
        await this.components.batchQueue.stop();
      }

      // Shutdown plugins
      if (this.components.pluginLoader) {
        await this.components.pluginLoader.shutdown();
      }

      // Close database
      if (this.components.dataStore) {
        await this.components.dataStore.close();
      }

      // Kill child process
      if (this.components.processManager) {
        await this.components.processManager.gracefulShutdown(
          this.config.wrapper.gracefulShutdownTimeout
        );
      }

      // Cleanup streams
      if (this.components.streamHandler) {
        this.components.streamHandler.cleanup();
      }

      this.logger.info('Wrapper shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', { error: error.message });
      throw error;
    }
  }

  getMetrics() {
    return {
      wrapper: {
        ...this.metrics,
        uptime: Date.now() - this.metrics.startTime
      },
      eventBus: this.components.eventBus?.getMetrics() || {},
      batchQueue: this.components.batchQueue?.getMetrics() || {},
      streamHandler: this.components.streamHandler?.getMetrics() || {},
      plugins: this.components.pluginLoader?.getPluginMetrics() || []
    };
  }

  getConfig() {
    return { ...this.config };
  }

  expandPath(filePath) {
    if (filePath.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE;
      return path.join(home, filePath.slice(1));
    }
    return path.resolve(filePath);
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

module.exports = { 
  ClaudeWrapper,
  JsonStreamParser,
  EventBus,
  ProcessManager,
  StreamHandler,
  PluginLoader,
  SqliteAdapter,
  BatchQueue
};