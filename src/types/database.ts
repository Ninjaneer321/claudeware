import { QueryRecord, ResponseRecord, OptimizationSuggestion } from './events';

export interface DataStore {
  init(): Promise<void>;
  close(): Promise<void>;

  // Core operations
  saveQuery(query: QueryRecord): Promise<void>;
  saveResponse(response: ResponseRecord): Promise<void>;
  saveOptimization(optimization: OptimizationSuggestion): Promise<void>;

  // Batch operations
  batchSave(records: Array<QueryRecord | ResponseRecord>): Promise<void>;

  // Query operations
  getQuery(id: string): Promise<QueryRecord | null>;
  getResponse(queryId: string): Promise<ResponseRecord | null>;
  getSessionQueries(sessionId: string): Promise<QueryRecord[]>;

  // Analytics
  getQueryStats(timeRange?: { start: Date; end: Date }): Promise<QueryStats>;
}

export interface QueryStats {
  totalQueries: number;
  totalTokens: number;
  averageLatency: number;
  categoryCounts: Record<string, number>;
  modelUsage: Record<string, number>;
  errorRate: number;
}

export interface BatchQueue<T> {
  add(item: T): void;
  flush(): Promise<void>;
  size(): number;
}

export interface DatabaseConfig {
  path?: string;
  batchSize: number;
  flushInterval: number;
  walMode: boolean;
  busyTimeout?: number;
}