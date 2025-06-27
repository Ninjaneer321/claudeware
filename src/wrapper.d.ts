/**
 * Type declarations for wrapper.js
 */

import { EventEmitter } from 'events';
import { QueryEvent } from './types/events';

export interface ClaudeWrapperOptions {
  modelName?: string;
  apiKey?: string;
  dataStore?: any;
  plugins?: string[];
  enableMonitoring?: boolean;
  debug?: boolean;
}

export class ClaudeWrapper extends EventEmitter {
  constructor(options?: ClaudeWrapperOptions);

  run(args: string[]): Promise<void>;
  shutdown(): Promise<void>;

  // Event emitter methods
  on(event: 'query' | 'response' | 'tool_use' | 'error', listener: (event: QueryEvent) => void): this;
  emit(event: 'query' | 'response' | 'tool_use' | 'error', eventData: QueryEvent): boolean;
}