export interface WrapperConfig {
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

  database: {
    type: 'sqlite' | 'supabase';
    path?: string;
    url?: string;
    batchSize: number;
    flushInterval: number;
    walMode: boolean;
  };

  monitoring: {
    enabled: boolean;
    metricsPort?: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    logPath?: string;
  };

  categorization: {
    cacheSize: number;
    patterns: CategorizationPattern[];
  };
}

export interface CategorizationPattern {
  name: string;
  category: string;
  patterns: string[];
  priority: number;
}

export interface RuntimeConfig extends WrapperConfig {
  sessionId: string;
  startTime: number;
  env: NodeJS.ProcessEnv;
}