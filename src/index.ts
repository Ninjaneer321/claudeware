/**
 * Claudeware - Main TypeScript Entry Point
 *
 * Provides TypeScript exports for the Claudeware middleware system.
 */

// Re-export existing JavaScript modules
export { ClaudeWrapper } from './wrapper';
export { createWrappedSDK, SDKWrapperAdapter } from './sdk';

// Export plugin infrastructure - using the original Plugin interface from types/plugin.ts
export {
  // Infrastructure exports
  IPluginDataAccess,
  IQueryBuilder,
  IQueryFactory,
  IContractManager,
  IPermissionValidator,
  // Concrete implementations
  PluginDataAccess,
  QueryBuilder,
  QueryFactory,
  ContractManager,
  PermissionValidator
} from './plugins/infrastructure';

// Export event bus and plugin loader
export { EventBus } from './plugins/event-bus';
export { PluginLoader, PluginMetrics } from './plugins/plugin-loader';

// Export types - explicit exports to avoid conflicts
export {
  // Event types
  EventMetadata,
  QueryEvent,
  OptimizationSuggestion,
  // Plugin types from types/plugin.ts (the canonical source)
  Plugin,
  PluginContext,
  PluginManifest,
  PluginFactory,
  PluginLoadResult,
  PluginError,
  // Database types
  DataStore,
  QueryStats,
  BatchQueue,
  DatabaseConfig,
  // Stream types (interfaces only)
  StreamConfig,
  ProcessManager as IProcessManager,  // Rename interface to avoid conflict
  StreamHandler as IStreamHandler,  // Rename interface to avoid conflict
  JsonStreamParser as IJsonStreamParser,
  StreamMetrics as IStreamMetrics,  // Rename interface to avoid conflict
  // Config types
  WrapperConfig,
  RuntimeConfig,
  CategorizationPattern
} from './types';

// Export specific database items from database module
export {
  SqliteAdapter
} from './database';

// Export core implementations
export { StreamHandler } from './core/stream-handler';
export { JsonStreamParser } from './core/json-parser';
export { ProcessManager } from './core/process-manager';

// Re-export events types that are used across modules
export { QueryRecord, ResponseRecord } from './types/events';