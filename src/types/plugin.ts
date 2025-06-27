import { EventEmitter } from 'events';
import { QueryEvent } from './events';
import { DataStore } from './database';
import { Logger } from 'pino';

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  dependencies: string[];
  priority: number;
  timeout: number;
  capabilities: string[];
  config?: Record<string, any>;
}

export interface PluginContext {
  eventBus: EventEmitter;
  dataStore: DataStore;
  logger: Logger;
  config: Record<string, any>;
  sharedState: Map<string, any>;
}

export interface Plugin {
  name: string;
  version: string;
  manifest: PluginManifest;

  initialize(context: PluginContext): Promise<void>;
  onEvent(event: QueryEvent, context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
}

export interface PluginFactory {
  create(): Plugin;
}

export interface PluginLoadResult {
  plugin: Plugin;
  manifest: PluginManifest;
  path: string;
}

export interface PluginError extends Error {
  pluginName: string;
  eventId?: string;
  cause?: Error;
}