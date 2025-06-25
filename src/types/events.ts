export interface EventMetadata {
  correlationId: string;
  sessionId: string;
  timestamp: number;
  source: string;
  queryId?: string;
  latencyMs?: number;
  [key: string]: any; // Allow additional properties
}

export interface QueryEvent {
  id: string;
  type: 'query' | 'response' | 'tool_use' | 'error';
  timestamp: number;
  data: any;
  metadata: EventMetadata;
}

export interface QueryRecord {
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

export interface ResponseRecord {
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

export interface OptimizationSuggestion {
  queryId: string;
  suggestion: string;
  alternativeModel?: string;
  estimatedSavings?: number;
  confidence: 'low' | 'medium' | 'high';
}