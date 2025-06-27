# Plugin API Documentation

This guide covers everything you need to know to create plugins for the Claudeware.

## Table of Contents

- [Overview](#overview)
- [Plugin Structure](#plugin-structure)
- [Plugin Interface](#plugin-interface)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Event System](#event-system)
- [Plugin Context](#plugin-context)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Testing Plugins](#testing-plugins)
- [Publishing Plugins](#publishing-plugins)

## Overview

Plugins are the primary way to extend Claudeware functionality. They can:

- Process queries and responses
- Add custom analytics
- Implement caching strategies
- Enforce rate limiting
- Add security features
- Integrate with external services

### Key Principles

1. **Zero Impact**: Plugins must never slow down Claude Code output
2. **Error Isolation**: Plugin errors don't affect other plugins or core functionality
3. **Async Processing**: All plugin operations are asynchronous
4. **Event-Driven**: Plugins react to events from the wrapper

## Plugin Structure

A plugin consists of:

```
my-plugin/
├── manifest.json      # Plugin metadata and configuration
├── index.ts          # Main plugin implementation
├── package.json      # NPM dependencies (optional)
├── README.md         # Plugin documentation
└── tests/           # Plugin tests (recommended)
```

### manifest.json

The manifest file describes your plugin:

```json
{
  "name": "my-awesome-plugin",
  "version": "1.0.0",
  "description": "Adds awesome features to Claude Code",
  "author": "Your Name <email@example.com>",
  "license": "MIT",
  "main": "./index.js",
  "dependencies": ["query-collector"],
  "priority": 50,
  "timeout": 5000,
  "capabilities": ["analytics", "optimization"],
  "config": {
    "apiKey": {
      "type": "string",
      "required": false,
      "description": "API key for external service"
    },
    "threshold": {
      "type": "number",
      "default": 100,
      "description": "Processing threshold"
    }
  }
}
```

### Manifest Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Unique plugin identifier |
| version | string | Yes | Semantic version (x.y.z) |
| description | string | No | Human-readable description |
| author | string | No | Plugin author information |
| license | string | No | License identifier |
| main | string | Yes | Entry point file (relative path) |
| dependencies | string[] | No | Other plugins this depends on |
| priority | number | No | Execution order (0-100, default: 50) |
| timeout | number | No | Max execution time in ms (default: 5000) |
| capabilities | string[] | No | Plugin capabilities for discovery |
| config | object | No | Configuration schema |

## Plugin Interface

Every plugin must implement the `Plugin` interface:

```typescript
import { Plugin, PluginContext, QueryEvent, PluginManifest } from 'claudeware';

export default class MyPlugin implements Plugin {
  // Required properties
  name: string = 'my-plugin';
  version: string = '1.0.0';
  manifest: PluginManifest;

  constructor() {
    this.manifest = require('./manifest.json');
  }

  // Required: Initialize plugin
  async initialize(context: PluginContext): Promise<void> {
    // Setup code here
    // Access config via context.config
    // Store references you need
  }

  // Required: Handle events
  async onEvent(event: QueryEvent, context: PluginContext): Promise<void> {
    // Process events here
    // Never throw errors - handle them internally
  }

  // Required: Cleanup resources
  async shutdown(): Promise<void> {
    // Cleanup code here
    // Close connections, save state, etc.
  }
}
```

## Plugin Lifecycle

### 1. Discovery

The Plugin Loader discovers plugins by:
- Scanning the plugins directory
- Reading manifest.json files
- Validating manifest schema

### 2. Loading

Plugins are loaded in dependency order:
- Dependencies are loaded first
- Circular dependencies are detected and rejected
- Missing dependencies cause load failure

### 3. Initialization

```typescript
async initialize(context: PluginContext): Promise<void> {
  // Access configuration
  const apiKey = context.config.apiKey;
  
  // Setup logging
  this.logger = context.logger.child({ plugin: this.name });
  
  // Initialize connections
  this.client = new ExternalClient(apiKey);
  
  // Register for specific events (optional)
  context.eventBus.on('special-event', this.handleSpecial.bind(this));
  
  this.logger.info('Plugin initialized successfully');
}
```

### 4. Event Processing

```typescript
async onEvent(event: QueryEvent, context: PluginContext): Promise<void> {
  try {
    switch (event.type) {
      case 'query':
        await this.handleQuery(event, context);
        break;
      case 'response':
        await this.handleResponse(event, context);
        break;
      case 'error':
        await this.handleError(event, context);
        break;
    }
  } catch (error) {
    // Always handle errors - never throw!
    context.logger.error({ error, event: event.id }, 'Plugin error');
  }
}
```

### 5. Shutdown

```typescript
async shutdown(): Promise<void> {
  // Save any pending data
  await this.savePendingData();
  
  // Close connections
  await this.client?.close();
  
  // Clear timers
  clearInterval(this.syncTimer);
  
  this.logger.info('Plugin shutdown complete');
}
```

## Event System

### Event Types

Plugins receive these event types:

#### Query Event
```typescript
{
  id: string;
  type: 'query';
  timestamp: number;
  data: {
    messages: Array<{ role: string; content: string }>;
    model: string;
    options?: ClaudeCodeOptions;
  };
  metadata: {
    correlationId: string;
    sessionId: string;
    timestamp: number;
    source: 'cli' | 'sdk';
  };
}
```

#### Response Event
```typescript
{
  id: string;
  type: 'response';
  timestamp: number;
  data: {
    id: string;
    model: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    content: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };
  metadata: {
    correlationId: string;
    sessionId: string;
    timestamp: number;
    source: 'cli' | 'sdk';
    queryId: string;
    latencyMs: number;
  };
}
```

#### Error Event
```typescript
{
  id: string;
  type: 'error';
  timestamp: number;
  data: {
    error: {
      type: string;
      message: string;
      stack?: string;
    };
  };
  metadata: {
    correlationId: string;
    sessionId: string;
    timestamp: number;
    source: 'cli' | 'sdk';
    queryId?: string;
  };
}
```

### Custom Events

Plugins can emit custom events:

```typescript
// Emit a custom event
context.eventBus.emit('my-plugin:processed', {
  queryId: event.id,
  result: processedData
});

// Listen for custom events in other plugins
context.eventBus.on('my-plugin:processed', (data) => {
  // React to the event
});
```

## Plugin Context

The `PluginContext` provides access to wrapper services:

```typescript
interface PluginContext {
  // Event system for plugin communication
  eventBus: EventEmitter;
  
  // Database access
  dataStore: DataStore;
  
  // Logging
  logger: Logger;
  
  // Plugin configuration
  config: Record<string, any>;
  
  // Shared state between plugins
  sharedState: Map<string, any>;
}
```

### Using the DataStore

```typescript
async onEvent(event: QueryEvent, context: PluginContext) {
  if (event.type === 'query') {
    // Save query to database
    await context.dataStore.saveQuery({
      id: event.id,
      sessionId: event.metadata.sessionId,
      timestamp: event.timestamp,
      query: event.data.messages[0].content,
      model: event.data.model,
      category: this.categorize(event.data.messages[0].content),
      tokenCount: this.countTokens(event.data.messages[0].content)
    });
  }
}
```

### Using the Logger

```typescript
// Log at different levels
context.logger.debug({ event: event.id }, 'Processing event');
context.logger.info('Query categorized', { category });
context.logger.warn('Rate limit approaching', { remaining: 10 });
context.logger.error({ error }, 'Failed to process query');

// Create child logger with context
this.logger = context.logger.child({ 
  plugin: this.name,
  version: this.version 
});
```

### Using Shared State

```typescript
// Store data for other plugins
context.sharedState.set('rate-limit:remaining', 50);

// Read data from other plugins
const remaining = context.sharedState.get('rate-limit:remaining');

// Store complex objects
context.sharedState.set('cache:queries', new Map());
```

## Error Handling

### Golden Rules

1. **Never throw from onEvent()** - Always catch and handle errors
2. **Log errors with context** - Include event ID and relevant data
3. **Fail gracefully** - Continue processing other events
4. **Set defaults** - Have sensible defaults when operations fail

### Error Handling Pattern

```typescript
async onEvent(event: QueryEvent, context: PluginContext): Promise<void> {
  try {
    // Main processing logic
    await this.processEvent(event, context);
  } catch (error) {
    // Log the error with context
    context.logger.error({
      error: error.message,
      stack: error.stack,
      eventId: event.id,
      eventType: event.type,
      plugin: this.name
    }, 'Plugin processing failed');

    // Optionally track metrics
    this.errorCount++;
    
    // Optionally emit error event
    context.eventBus.emit('plugin:error', {
      plugin: this.name,
      event: event.id,
      error: error.message
    });
    
    // Continue processing - don't re-throw!
  }
}
```

### Timeout Handling

The wrapper enforces timeouts. Handle long operations:

```typescript
async processExpensiveOperation(data: any): Promise<void> {
  // Use Promise.race for timeout
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Operation timeout')), 4000)
  );
  
  try {
    await Promise.race([
      this.expensiveOperation(data),
      timeout
    ]);
  } catch (error) {
    if (error.message === 'Operation timeout') {
      // Handle timeout specifically
      this.logger.warn('Operation timed out, using cached result');
      return this.getCachedResult(data);
    }
    throw error;
  }
}
```

## Best Practices

### 1. Performance

```typescript
// ❌ Bad: Blocking operations
const result = expensiveSyncOperation();

// ✅ Good: Async operations
const result = await expensiveAsyncOperation();

// ❌ Bad: Processing in onEvent
async onEvent(event: QueryEvent, context: PluginContext) {
  const result = await heavyComputation(event);
  await context.dataStore.save(result);
}

// ✅ Good: Queue for async processing
async onEvent(event: QueryEvent, context: PluginContext) {
  this.queue.push(event);
  // Return immediately, process async
}
```

### 2. Resource Management

```typescript
class MyPlugin implements Plugin {
  private client?: ExternalClient;
  private intervals: NodeJS.Timer[] = [];

  async initialize(context: PluginContext) {
    // Track resources for cleanup
    this.client = new ExternalClient();
    
    const interval = setInterval(() => {
      this.sync();
    }, 60000);
    
    this.intervals.push(interval);
  }

  async shutdown() {
    // Clean up all resources
    await this.client?.close();
    
    this.intervals.forEach(interval => {
      clearInterval(interval);
    });
  }
}
```

### 3. Configuration

```typescript
// Define configuration schema in manifest.json
{
  "config": {
    "apiEndpoint": {
      "type": "string",
      "required": true,
      "description": "API endpoint URL"
    },
    "retryAttempts": {
      "type": "number",
      "default": 3,
      "min": 1,
      "max": 10
    },
    "features": {
      "type": "object",
      "properties": {
        "caching": { "type": "boolean", "default": true },
        "compression": { "type": "boolean", "default": false }
      }
    }
  }
}

// Access in plugin
async initialize(context: PluginContext) {
  const endpoint = context.config.apiEndpoint;
  const retries = context.config.retryAttempts || 3;
  const features = context.config.features || {};
  
  if (!endpoint) {
    throw new Error('apiEndpoint is required');
  }
}
```

### 4. Testing

```typescript
// Make your plugin testable
export class MyPlugin implements Plugin {
  constructor(private deps?: {
    client?: ExternalClient;
    cache?: CacheService;
  }) {}

  async initialize(context: PluginContext) {
    this.client = this.deps?.client || new ExternalClient();
    this.cache = this.deps?.cache || new CacheService();
  }
}

// In tests
const mockClient = { send: jest.fn() };
const plugin = new MyPlugin({ client: mockClient });
```

## Examples

### Example 1: Rate Limiter Plugin

```typescript
export default class RateLimiterPlugin implements Plugin {
  name = 'rate-limiter';
  version = '1.0.0';
  manifest = require('./manifest.json');
  
  private requests: Map<string, number[]> = new Map();
  private limits: { perMinute: number; perHour: number };

  async initialize(context: PluginContext) {
    this.limits = {
      perMinute: context.config.perMinute || 20,
      perHour: context.config.perHour || 100
    };
    
    // Clean old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async onEvent(event: QueryEvent, context: PluginContext) {
    if (event.type !== 'query') return;

    const sessionId = event.metadata.sessionId;
    const now = Date.now();
    
    // Get request history
    const history = this.requests.get(sessionId) || [];
    
    // Count recent requests
    const lastMinute = history.filter(t => now - t < 60000).length;
    const lastHour = history.filter(t => now - t < 3600000).length;
    
    // Check limits
    if (lastMinute >= this.limits.perMinute) {
      context.eventBus.emit('rate-limit:exceeded', {
        sessionId,
        limit: 'perMinute',
        current: lastMinute
      });
      
      throw new Error('Rate limit exceeded: per minute');
    }
    
    if (lastHour >= this.limits.perHour) {
      context.eventBus.emit('rate-limit:exceeded', {
        sessionId,
        limit: 'perHour',
        current: lastHour
      });
      
      throw new Error('Rate limit exceeded: per hour');
    }
    
    // Track request
    history.push(now);
    this.requests.set(sessionId, history);
    
    // Share state
    context.sharedState.set(`rate-limit:${sessionId}:remaining`, {
      perMinute: this.limits.perMinute - lastMinute - 1,
      perHour: this.limits.perHour - lastHour - 1
    });
  }

  async shutdown() {
    this.requests.clear();
  }

  private cleanup() {
    const now = Date.now();
    const hourAgo = now - 3600000;
    
    for (const [sessionId, history] of this.requests.entries()) {
      const filtered = history.filter(t => t > hourAgo);
      if (filtered.length === 0) {
        this.requests.delete(sessionId);
      } else {
        this.requests.set(sessionId, filtered);
      }
    }
  }
}
```

### Example 2: Cache Plugin

```typescript
export default class CachePlugin implements Plugin {
  name = 'cache';
  version = '1.0.0';
  manifest = require('./manifest.json');
  
  private cache: LRUCache<string, CachedResponse>;
  private stats = { hits: 0, misses: 0 };

  async initialize(context: PluginContext) {
    this.cache = new LRUCache({
      max: context.config.maxEntries || 1000,
      ttl: context.config.ttlMs || 3600000 // 1 hour
    });
    
    // Listen for queries
    context.eventBus.on('query:before', this.checkCache.bind(this));
  }

  async onEvent(event: QueryEvent, context: PluginContext) {
    if (event.type === 'response') {
      // Cache the response
      const queryId = event.metadata.queryId;
      const query = context.sharedState.get(`query:${queryId}`);
      
      if (query && this.shouldCache(query, event)) {
        const key = this.getCacheKey(query);
        this.cache.set(key, {
          response: event.data,
          timestamp: Date.now()
        });
        
        context.logger.debug({ key }, 'Response cached');
      }
    }
  }

  private async checkCache(event: any) {
    const key = this.getCacheKey(event.query);
    const cached = this.cache.get(key);
    
    if (cached) {
      this.stats.hits++;
      event.preventDefault(); // Stop normal processing
      event.respond(cached.response); // Return cached response
      
      this.logger.info({ key }, 'Cache hit');
    } else {
      this.stats.misses++;
    }
  }

  private getCacheKey(query: string): string {
    // Simple key generation - could be more sophisticated
    return createHash('sha256').update(query).digest('hex');
  }

  private shouldCache(query: string, response: any): boolean {
    // Don't cache errors
    if (response.error) return false;
    
    // Don't cache tool use
    if (response.data.content?.some(c => c.type === 'tool_use')) return false;
    
    // Don't cache large responses
    const size = JSON.stringify(response).length;
    if (size > 100000) return false;
    
    return true;
  }

  async shutdown() {
    this.logger.info('Cache stats', this.stats);
    this.cache.clear();
  }
}
```

### Example 3: Analytics Plugin

```typescript
export default class AnalyticsPlugin implements Plugin {
  name = 'analytics';
  version = '1.0.0';
  manifest = require('./manifest.json');
  
  private metrics: {
    queries: Map<string, number>;
    tokens: { input: number; output: number };
    latencies: number[];
    errors: number;
  };

  async initialize(context: PluginContext) {
    this.metrics = {
      queries: new Map(),
      tokens: { input: 0, output: 0 },
      latencies: [],
      errors: 0
    };
    
    // Report metrics periodically
    setInterval(() => this.reportMetrics(context), 300000); // 5 min
  }

  async onEvent(event: QueryEvent, context: PluginContext) {
    switch (event.type) {
      case 'query':
        // Track query categories
        const category = this.categorize(event.data.messages[0].content);
        this.metrics.queries.set(
          category,
          (this.metrics.queries.get(category) || 0) + 1
        );
        break;
        
      case 'response':
        // Track tokens
        if (event.data.usage) {
          this.metrics.tokens.input += event.data.usage.input_tokens || 0;
          this.metrics.tokens.output += event.data.usage.output_tokens || 0;
        }
        
        // Track latency
        if (event.metadata.latencyMs) {
          this.metrics.latencies.push(event.metadata.latencyMs);
        }
        break;
        
      case 'error':
        this.metrics.errors++;
        break;
    }
  }

  private categorize(query: string): string {
    const lower = query.toLowerCase();
    if (lower.includes('create') || lower.includes('build')) return 'create';
    if (lower.includes('fix') || lower.includes('debug')) return 'debug';
    if (lower.includes('explain') || lower.includes('what')) return 'explain';
    if (lower.includes('refactor') || lower.includes('improve')) return 'refactor';
    return 'other';
  }

  private async reportMetrics(context: PluginContext) {
    const avgLatency = this.metrics.latencies.length > 0
      ? this.metrics.latencies.reduce((a, b) => a + b) / this.metrics.latencies.length
      : 0;
    
    const report = {
      timestamp: new Date().toISOString(),
      queries: Object.fromEntries(this.metrics.queries),
      tokens: this.metrics.tokens,
      avgLatency,
      errorRate: this.metrics.errors / (this.metrics.queries.size || 1)
    };
    
    context.logger.info({ report }, 'Analytics report');
    
    // Optionally send to external service
    if (context.config.webhookUrl) {
      await this.sendWebhook(context.config.webhookUrl, report);
    }
    
    // Reset metrics
    this.metrics.latencies = [];
  }

  async shutdown() {
    // Final report
    await this.reportMetrics(this.context);
  }
}
```

## Testing Plugins

### Unit Testing

```typescript
// __tests__/my-plugin.test.ts
import MyPlugin from '../src/my-plugin';
import { PluginContext, QueryEvent } from 'claudeware';

describe('MyPlugin', () => {
  let plugin: MyPlugin;
  let mockContext: PluginContext;
  
  beforeEach(() => {
    plugin = new MyPlugin();
    mockContext = {
      eventBus: new EventEmitter(),
      dataStore: {
        saveQuery: jest.fn(),
        saveResponse: jest.fn()
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn(() => mockContext.logger)
      },
      config: {
        apiKey: 'test-key'
      },
      sharedState: new Map()
    };
  });
  
  test('initializes successfully', async () => {
    await expect(plugin.initialize(mockContext)).resolves.not.toThrow();
  });
  
  test('processes query events', async () => {
    await plugin.initialize(mockContext);
    
    const event: QueryEvent = {
      id: 'test-1',
      type: 'query',
      timestamp: Date.now(),
      data: {
        messages: [{ role: 'user', content: 'test query' }],
        model: 'claude-3'
      },
      metadata: {
        correlationId: 'corr-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        source: 'test'
      }
    };
    
    await plugin.onEvent(event, mockContext);
    
    expect(mockContext.dataStore.saveQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-1',
        query: 'test query'
      })
    );
  });
  
  test('handles errors gracefully', async () => {
    await plugin.initialize(mockContext);
    
    // Force an error
    mockContext.dataStore.saveQuery = jest.fn().mockRejectedValue(
      new Error('Database error')
    );
    
    const event: QueryEvent = { /* ... */ };
    
    // Should not throw
    await expect(plugin.onEvent(event, mockContext)).resolves.not.toThrow();
    
    // Should log error
    expect(mockContext.logger.error).toHaveBeenCalled();
  });
});
```

### Integration Testing

```typescript
// __tests__/integration.test.ts
import { PluginLoader } from 'claudeware';
import path from 'path';

describe('Plugin Integration', () => {
  let loader: PluginLoader;
  
  beforeEach(async () => {
    loader = new PluginLoader(mockContext);
    await loader.loadPlugins(path.join(__dirname, '../'));
  });
  
  test('plugin loads and processes events', async () => {
    const plugin = loader.getPlugin('my-plugin');
    expect(plugin).toBeDefined();
    
    // Send test event
    await loader.executePlugins(testEvent);
    
    // Verify results
    expect(mockContext.dataStore.saveQuery).toHaveBeenCalled();
  });
});
```

## Publishing Plugins

### NPM Package Structure

```
my-plugin/
├── package.json
├── manifest.json
├── README.md
├── LICENSE
├── src/
│   └── index.ts
├── dist/
│   └── index.js
└── tests/
    └── plugin.test.ts
```

### package.json

```json
{
  "name": "claude-code-plugin-myname",
  "version": "1.0.0",
  "description": "My awesome Claudeware plugin",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist",
    "manifest.json",
    "README.md"
  ],
  "keywords": [
    "claude-code",
    "claude-code-plugin",
    "claudeware"
  ],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublish": "npm run build"
  },
  "peerDependencies": {
    "claudeware": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "claudeware": "^1.0.0",
    "jest": "^29.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Publishing Steps

1. **Test thoroughly**
   ```bash
   npm test
   npm run build
   ```

2. **Document clearly**
   - README with examples
   - Configuration options
   - Compatibility notes

3. **Version correctly**
   ```bash
   npm version patch/minor/major
   ```

4. **Publish to NPM**
   ```bash
   npm publish
   ```

5. **Submit to plugin registry** (coming soon)
   ```bash
   claudeware publish-plugin
   ```

### Plugin Discovery

Users can install your plugin:

```bash
# Install from NPM
npm install -g claude-code-plugin-myname

# Or locally
cd ~/.claude-code/plugins
git clone https://github.com/you/my-plugin.git
```

## Advanced Topics

### Inter-Plugin Communication

```typescript
// Plugin A emits data
context.eventBus.emit('pluginA:data-ready', {
  processedData: results
});

// Plugin B listens
context.eventBus.on('pluginA:data-ready', async (data) => {
  await this.processDataFromPluginA(data);
});
```

### Dynamic Configuration

```typescript
// Watch for config changes
context.eventBus.on('config:changed', (newConfig) => {
  if (newConfig.plugin === this.name) {
    this.updateConfiguration(newConfig.values);
  }
});

// Request config reload
context.eventBus.emit('config:reload', { plugin: this.name });
```

### Custom Commands

```typescript
// Register custom CLI commands
async initialize(context: PluginContext) {
  context.registerCommand('analyze', {
    description: 'Analyze query patterns',
    handler: async (args) => {
      const stats = await this.analyzePatterns();
      return formatStats(stats);
    }
  });
}
```

### Performance Monitoring

```typescript
// Track plugin performance
const startTime = Date.now();

try {
  await this.processEvent(event);
} finally {
  const duration = Date.now() - startTime;
  
  context.eventBus.emit('plugin:metrics', {
    plugin: this.name,
    event: event.id,
    duration,
    success: true
  });
}
```

## Troubleshooting

### Common Issues

1. **Plugin not loading**
   - Check manifest.json syntax
   - Verify main file exists
   - Check for syntax errors
   - Review logs for errors

2. **Plugin timing out**
   - Reduce processing time
   - Use async operations
   - Queue heavy work

3. **Memory leaks**
   - Clean up in shutdown()
   - Clear intervals/timeouts
   - Release references

### Debug Mode

Enable debug logging:

```typescript
// In your plugin
const debug = context.config.debug || false;

if (debug) {
  context.logger.level = 'debug';
  context.logger.debug({ event }, 'Processing event');
}
```

### Performance Profiling

```typescript
// Use built-in profiler
const profiler = context.profiler.start('my-operation');
await heavyOperation();
profiler.end();

// Results available in metrics
```

## Support

- GitHub Issues: [claudeware/issues](https://github.com/your/repo)
- Plugin Registry: [claude-plugins.dev](https://claude-plugins.dev) (coming soon)
- Discord Community: [Join us](https://discord.gg/claude-plugins)

---

Happy plugin development! 🚀