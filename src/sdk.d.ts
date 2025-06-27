/**
 * Type declarations for sdk.js
 */

import { EventEmitter } from 'events';

export interface SDKOptions {
  apiKey?: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface SDKMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SDKStreamOptions {
  messages: SDKMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export class SDKWrapperAdapter extends EventEmitter {
  constructor(sdk: any, options?: SDKOptions);

  stream(options: SDKStreamOptions): AsyncGenerator<any, void, unknown>;
  complete(options: SDKStreamOptions): Promise<any>;
}

export function createWrappedSDK(sdk: any, options?: SDKOptions): SDKWrapperAdapter;