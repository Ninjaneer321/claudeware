# API Reference

Complete API documentation for Claudeware.

## Table of Contents

- [Core Classes](#core-classes)
- [Plugin System](#plugin-system)
- [Database Layer](#database-layer)
- [SDK Integration](#sdk-integration)
- [Types and Interfaces](#types-and-interfaces)
- [Utility Functions](#utility-functions)

## Core Classes

### ClaudeWrapper

Main wrapper class that orchestrates all components.

```typescript
class ClaudeWrapper {
  constructor(config: WrapperConfig)
  
  start(args: string[], stdin: Readable, stdout: Writable, stderr: Writable): Promise<void>
  shutdown(): Promise<void>
  getMetrics(): WrapperMetrics
  getConfig(): WrapperConfig
}
```

#### Constructor

```typescript
new ClaudeWrapper(config: WrapperConfig)
```

**Parameters:**
- `config`: Configuration object

**Example:**
```typescript
const wrapper = new ClaudeWrapper({
  mode: 'production',
  claudePath: '/usr/local/bin/claude',
  plugins: {
    directory: '~/.claude-code/plugins',
    timeout: 5000
  }
});
```

#### Methods

##### `start()`

Starts the wrapper with Claude Code.

```typescript
async start(
  args: string[],
  stdin: Readable,
  stdout: Writable,
  stderr: Writable
): Promise<void>
```

**Parameters:**
- `args`: Command line arguments
- `stdin`: Input stream
- `stdout`: Output stream
- `stderr`: Error stream

##### `shutdown()`

Gracefully shuts down the wrapper.

```typescript
async shutdown(): Promise<void>
```

**Returns:** Promise that resolves when shutdown is complete

### ProcessManager

Manages Claude Code child process lifecycle.

```typescript
class ProcessManager {
  spawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess
  kill(signal?: NodeJS.Signals, options?: KillOptions): boolean
  onExit(callback: ExitCallback): void
  onError(callback: ErrorCallback): void
  setupSignalForwarding(): void
  isRunning(): boolean
  getPid(): number | undefined
  gracefulShutdown(timeout: number): Promise<ExitResult>
  cleanup(): void
}
```

#### Methods

##### `spawn()`

Spawns a child process.

```typescript
spawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess
```

**Parameters:**
- `command`: Command to execute
- `args`: Command arguments
- `env`: Environment variables (optional)

**Returns:** Child process instance

##### `kill()`

Kills the child process.

```typescript
kill(signal?: NodeJS.Signals, options?: { forceTimeout?: number }): boolean
```

**Parameters:**
- `signal`: Signal to send (default: SIGTERM)
- `options.forceTimeout`: Timeout before SIGKILL (ms)

**Returns:** Success boolean

### StreamHandler

Handles stream processing with zero-latency passthrough.

```typescript
class StreamHandler {
  constructor(eventBus: EventEmitter, parser: JsonStreamParser)
  
  setupPassthrough(source: Readable, destination: Writable): void
  setupProcessing(source: Readable, processor?: Transform): void
  handleBackpressure(): void
  getMetrics(): StreamMetrics
  cleanup(): void
}
```

#### Methods

##### `setupPassthrough()`

Sets up direct stream passthrough.

```typescript
setupPassthrough(source: Readable, destination: Writable): void
```

**Parameters:**
- `source`: Input stream
- `destination`: Output stream

**Important:** This creates a direct pipe with zero processing.

##### `setupProcessing()`

Sets up parallel processing stream.

```typescript
setupProcessing(source: Readable, processor?: Transform): void
```

**Parameters:**
- `source`: Input stream
- `processor`: Optional transform stream

### JsonStreamParser

Parses streaming JSON from Claude Code.

```typescript
class JsonStreamParser {
  parse(chunk: Buffer | string): any[]
  reset(): void
  getBuffer(): string
}
```

#### Methods

##### `parse()`

Parses a chunk of data.

```typescript
parse(chunk: Buffer | string): any[]
```

**Parameters:**
- `chunk`: Data chunk to parse

**Returns:** Array of parsed JSON objects

**Example:**
```typescript
const parser = new JsonStreamParser();
const objects = parser.parse('{"type":"query"}\n{"type":"response"}');
// Returns: [{ type: 'query' }, { type: 'response' }]
```

## Plugin System

### PluginLoader

Discovers and manages plugins.

```typescript
class PluginLoader {
  constructor(context: PluginContext)
  
  loadPlugins(directory: string): Promise<Plugin[]>
  resolveDependencies(plugins: Plugin[]): Promise<Plugin[]>
  initializePlugin(plugin: Plugin): Promise<void>
  executePlugins(event: QueryEvent): Promise<void>
  registerPlugin(plugin: Plugin): void
  disablePlugin(name: string): void
  getPlugin(name: string): Plugin | undefined
  getPluginMetrics(): Promise<PluginMetrics[]>
  shutdown(): Promise<void>
}
```

#### Methods

##### `loadPlugins()`

Loads plugins from a directory.

```typescript
async loadPlugins(directory: string): Promise<Plugin[]>
```

**Parameters:**
- `directory`: Path to plugins directory

**Returns:** Array of loaded plugins

##### `executePlugins()`

Executes all plugins for an event.

```typescript
async executePlugins(event: QueryEvent): Promise<void>
```

**Parameters:**
- `event`: Event to process

### EventBus

Central event system for plugin communication.

```typescript
class EventBus extends EventEmitter {
  emitEvent(event: QueryEvent): void
  emitEventAsync(event: QueryEvent): Promise<void>
  on(eventType: string, listener: Function, options?: ListenerOptions): void
  once(eventType: string, listener: Function): void
  off(eventType: string, listener: Function): void
  removeAllListeners(eventType?: string): void
  listenerCount(eventType: string): number
  enableReplay(bufferSize: number): void
  getRecentEvents(): QueryEvent[]
  getMetrics(): EventMetrics
}
```

#### Methods

##### `emitEvent()`

Emits an event synchronously.

```typescript
emitEvent(event: QueryEvent): void
```

**Parameters:**
- `event`: Event to emit

##### `on()`

Registers an event listener.

```typescript
on(eventType: string, listener: Function, options?: ListenerOptions): void
```

**Parameters:**
- `eventType`: Event type to listen for ('query', 'response', '*')
- `listener`: Event handler function
- `options`: Listener options

**Options:**
```typescript
interface ListenerOptions {
  filter?: (event: QueryEvent) => boolean;
  replay?: boolean;
  priority?: number;
}
```

## Database Layer

### SqliteAdapter

SQLite database adapter implementation.

```typescript
class SqliteAdapter implements DataStore {
  constructor(config?: DatabaseConfig)
  
  init(): Promise<void>
  close(): Promise<void>
  saveQuery(query: QueryRecord): Promise<void>
  saveResponse(response: ResponseRecord): Promise<void>
  saveOptimization(optimization: OptimizationSuggestion): Promise<void>
  batchSave(records: Array<QueryRecord | ResponseRecord>): Promise<void>
  getQuery(id: string): Promise<QueryRecord | null>
  getResponse(queryId: string): Promise<ResponseRecord | null>
  getSessionQueries(sessionId: string): Promise<QueryRecord[]>
  getQueryStats(timeRange?: TimeRange): Promise<QueryStats>
}
```

#### Methods

##### `init()`

Initializes the database.

```typescript
async init(): Promise<void>
```

Creates tables, indices, and prepares statements.

##### `saveQuery()`

Saves a query record.

```typescript
async saveQuery(query: QueryRecord): Promise<void>
```

**Parameters:**
- `query`: Query record to save

### BatchQueue

Generic batching queue for efficient writes.

```typescript
class BatchQueue<T> extends EventEmitter {
  constructor(options: BatchQueueOptions<T>)
  
  add(item: T): void
  flush(): Promise<void>
  stop(): Promise<void>
  size(): number
  getPending(): number
  getMetrics(): BatchMetrics
}
```

#### Constructor

```typescript
new BatchQueue<T>(options: BatchQueueOptions<T>)
```

**Options:**
```typescript
interface BatchQueueOptions<T> {
  batchSize: number;
  flushInterval: number;
  handler: (batch: T[]) => Promise<void>;
  retryAttempts?: number;
  retryDelay?: number;
  maxConcurrent?: number;
  onError?: (error: Error, batch: T[]) => void;
}
```

## SDK Integration

### createWrappedSDK

Factory function for creating wrapped SDK instances.

```typescript
function createWrappedSDK(config?: SDKWrapperConfig): WrappedSDK
```

**Parameters:**
- `config`: Optional configuration

**Returns:**
```typescript
interface WrappedSDK {
  query: (prompt: string, options?: ClaudeCodeOptions) => AsyncGenerator<Message>;
  getMetrics: () => Promise<SDKMetrics>;
  shutdown: () => Promise<void>;
}
```

**Example:**
```typescript
const { query, getMetrics, shutdown } = createWrappedSDK({
  pluginDirectory: './plugins',
  databasePath: './queries.db',
  enabledPlugins: ['query-collector', 'cache']
});

// Use the wrapped query function
for await (const message of query('Hello!')) {
  console.log(message);
}
```

### SDKWrapperAdapter

Adapter class for SDK integration.

```typescript
class SDKWrapperAdapter {
  constructor(config?: SDKWrapperConfig)
  
  initialize(): Promise<void>
  query(prompt: string, options?: ClaudeCodeOptions): AsyncGenerator<Message>
  getMetrics(): Promise<SDKMetrics>
  shutdown(): Promise<void>
}
```

## Types and Interfaces

### Configuration Types

#### WrapperConfig

```typescript
interface WrapperConfig {
  mode: 'development' | 'production';
  claudePath: string;
  wrapper: {
    timeout: number;
    bufferSize: number;
    gracefulShutdownTimeout: number;
  };
  plugins: {
    directory: string;
    timeout: number;
    retryAttempts: number;
    enabledPlugins?: string[];
    disabledPlugins?: string[];
  };
  database: DatabaseConfig;
  monitoring: {
    enabled: boolean;
    metricsPort?: number;
    logLevel: LogLevel;
    logPath?: string;
  };
}
```

#### DatabaseConfig

```typescript
interface DatabaseConfig {
  type: 'sqlite' | 'supabase';
  path?: string;
  url?: string;
  batchSize: number;
  flushInterval: number;
  walMode: boolean;
  busyTimeout?: number;
}
```

### Event Types

#### QueryEvent

```typescript
interface QueryEvent {
  id: string;
  type: 'query' | 'response' | 'error' | 'tool_use';
  timestamp: number;
  data: any;
  metadata: EventMetadata;
}
```

#### EventMetadata

```typescript
interface EventMetadata {
  correlationId: string;
  sessionId: string;
  timestamp: number;
  source: 'cli' | 'sdk';
  queryId?: string;
  latencyMs?: number;
}
```

### Plugin Types

#### Plugin

```typescript
interface Plugin {
  name: string;
  version: string;
  manifest: PluginManifest;
  
  initialize(context: PluginContext): Promise<void>;
  onEvent(event: QueryEvent, context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
}
```

#### PluginContext

```typescript
interface PluginContext {
  eventBus: EventEmitter;
  dataStore: DataStore;
  logger: Logger;
  config: Record<string, any>;
  sharedState: Map<string, any>;
}
```

#### PluginManifest

```typescript
interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  dependencies: string[];
  priority: number;
  timeout: number;
  capabilities: string[];
  config?: Record<string, any>;
}
```

### Data Types

#### QueryRecord

```typescript
interface QueryRecord {
  id: string;
  sessionId: string;
  timestamp: number;
  query: string;
  model: string;
  category?: string;
  complexity?: string;
  tokenCount?: number;
  metadata?: Record<string, any>;
}
```

#### ResponseRecord

```typescript
interface ResponseRecord {
  id: string;
  queryId: string;
  sessionId: string;
  timestamp: number;
  response: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  finishReason?: string;
  error?: string;
}
```

## Utility Functions

### Stream Utilities

```typescript
// Check if stream is readable
function isReadableStream(stream: any): stream is Readable

// Check if stream is writable  
function isWritableStream(stream: any): stream is Writable

// Create passthrough stream
function createPassthrough(options?: TransformOptions): PassThrough
```

### Event Utilities

```typescript
// Generate unique event ID
function generateEventId(): string

// Generate correlation ID
function generateCorrelationId(): string

// Create event metadata
function createEventMetadata(source: 'cli' | 'sdk'): EventMetadata
```

### Plugin Utilities

```typescript
// Validate plugin manifest
function validateManifest(manifest: any): PluginManifest

// Resolve plugin path
function resolvePluginPath(directory: string, name: string): string

// Load plugin module
function loadPluginModule(path: string): Promise<Plugin>
```

### Database Utilities

```typescript
// Convert snake_case to camelCase
function snakeToCamel(obj: any): any

// Convert camelCase to snake_case
function camelToSnake(obj: any): any

// Serialize metadata to JSON
function serializeMetadata(metadata: any): string

// Parse metadata from JSON
function parseMetadata(json: string): any
```

## Error Classes

### WrapperError

Base error class for all wrapper errors.

```typescript
class WrapperError extends Error {
  constructor(message: string, cause?: Error)
  
  code: string;
  cause?: Error;
}
```

### PluginError

Plugin-specific errors.

```typescript
class PluginError extends WrapperError {
  constructor(pluginName: string, message: string, cause?: Error)
  
  pluginName: string;
  eventId?: string;
}
```

### DatabaseError

Database operation errors.

```typescript
class DatabaseError extends WrapperError {
  constructor(operation: string, message: string, cause?: Error)
  
  operation: string;
  query?: string;
}
```

## Constants

```typescript
// Default configuration values
export const DEFAULTS = {
  BUFFER_SIZE: 65536,
  PLUGIN_TIMEOUT: 5000,
  BATCH_SIZE: 100,
  FLUSH_INTERVAL: 1000,
  MAX_RETRIES: 3,
  GRACEFUL_SHUTDOWN_TIMEOUT: 5000
};

// Event types
export const EVENT_TYPES = {
  QUERY: 'query',
  RESPONSE: 'response',
  ERROR: 'error',
  TOOL_USE: 'tool_use'
};

// Log levels
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};
```

---

For more examples and usage patterns, see the [examples directory](../examples/).