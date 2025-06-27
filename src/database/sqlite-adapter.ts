import Database from 'better-sqlite3';
import {
  DataStore,
  QueryRecord,
  ResponseRecord,
  OptimizationSuggestion,
  QueryStats,
  DatabaseConfig
} from '../types';

interface PreparedStatements {
  insertQuery: Database.Statement;
  insertResponse: Database.Statement;
  insertOptimization: Database.Statement;
  getQuery: Database.Statement;
  getResponse: Database.Statement;
  getSessionQueries: Database.Statement;
  getStats: Database.Statement;
}

export class SqliteAdapter implements DataStore {
  private db!: Database.Database;
  private statements!: PreparedStatements;
  private config: DatabaseConfig;

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      path: config.path || ':memory:',
      batchSize: config.batchSize || 100,
      flushInterval: config.flushInterval || 5000,
      walMode: config.walMode !== undefined ? config.walMode : true,
      busyTimeout: config.busyTimeout || 5000
    };
  }

  async init(): Promise<void> {
    try {
      // Initialize database connection
      this.db = new Database(this.config.path!);

      // Set pragmas for performance
      if (this.config.walMode) {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
      this.db.pragma('foreign_keys = ON');

      // Create tables
      this.createTables();

      // Create indices
      this.createIndices();

      // Prepare statements
      this.prepareStatements();
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createTables(): void {
    // Queries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        query TEXT NOT NULL,
        model TEXT,
        category TEXT,
        complexity TEXT,
        token_count INTEGER,
        metadata TEXT
      )
    `);

    // Responses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        query_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        response TEXT,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        latency_ms INTEGER,
        finish_reason TEXT,
        error TEXT,
        FOREIGN KEY (query_id) REFERENCES queries(id)
      )
    `);

    // Optimizations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS optimizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_id TEXT NOT NULL,
        suggestion TEXT NOT NULL,
        alternative_model TEXT,
        estimated_savings REAL,
        confidence TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (query_id) REFERENCES queries(id)
      )
    `);
  }

  private createIndices(): void {
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_session_id ON queries(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON queries(timestamp)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_category ON queries(category)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_resp_query_id ON responses(query_id)');
  }

  private prepareStatements(): void {
    this.statements = {
      insertQuery: this.db.prepare(`
        INSERT INTO queries (
          id, session_id, timestamp, query, model,
          category, complexity, token_count, metadata
        ) VALUES (
          @id, @session_id, @timestamp, @query, @model,
          @category, @complexity, @token_count, @metadata
        )
      `),

      insertResponse: this.db.prepare(`
        INSERT INTO responses (
          id, query_id, session_id, timestamp, response,
          model, input_tokens, output_tokens, latency_ms,
          finish_reason, error
        ) VALUES (
          @id, @query_id, @session_id, @timestamp, @response,
          @model, @input_tokens, @output_tokens, @latency_ms,
          @finish_reason, @error
        )
      `),

      insertOptimization: this.db.prepare(`
        INSERT INTO optimizations (
          query_id, suggestion, alternative_model,
          estimated_savings, confidence
        ) VALUES (
          @query_id, @suggestion, @alternative_model,
          @estimated_savings, @confidence
        )
      `),

      getQuery: this.db.prepare(`
        SELECT * FROM queries WHERE id = ?
      `),

      getResponse: this.db.prepare(`
        SELECT * FROM responses WHERE query_id = ?
      `),

      getSessionQueries: this.db.prepare(`
        SELECT * FROM queries WHERE session_id = ?
        ORDER BY timestamp ASC
      `),

      getStats: this.db.prepare(`
        SELECT
          COUNT(*) as total_queries,
          SUM(token_count) as total_tokens,
          AVG(r.latency_ms) as avg_latency,
          SUM(CASE WHEN r.error IS NOT NULL THEN 1 ELSE 0 END) as error_count
        FROM queries q
        LEFT JOIN responses r ON q.id = r.query_id
        WHERE (@start IS NULL OR q.timestamp >= @start)
          AND (@end IS NULL OR q.timestamp <= @end)
      `)
    };
  }

  async saveQuery(query: QueryRecord): Promise<void> {
    try {
      const params = {
        id: query.id,
        session_id: query.sessionId,
        timestamp: query.timestamp,
        query: query.query,
        model: query.model,
        category: query.category || null,
        complexity: query.complexity || null,
        token_count: query.tokenCount || null,
        metadata: query.metadata ? JSON.stringify(query.metadata) : null
      };

      this.statements.insertQuery.run(params);
    } catch (error) {
      throw new Error(`Failed to save query: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async saveResponse(response: ResponseRecord): Promise<void> {
    try {
      const params = {
        id: response.id,
        query_id: response.queryId,
        session_id: response.sessionId,
        timestamp: response.timestamp,
        response: response.response || null,
        model: response.model,
        input_tokens: response.inputTokens || null,
        output_tokens: response.outputTokens || null,
        latency_ms: response.latencyMs || null,
        finish_reason: response.finishReason || null,
        error: response.error || null
      };

      this.statements.insertResponse.run(params);
    } catch (error) {
      throw new Error(`Failed to save response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async saveOptimization(optimization: OptimizationSuggestion): Promise<void> {
    try {
      const params = {
        query_id: optimization.queryId,
        suggestion: optimization.suggestion,
        alternative_model: optimization.alternativeModel || null,
        estimated_savings: optimization.estimatedSavings || null,
        confidence: optimization.confidence
      };

      this.statements.insertOptimization.run(params);
    } catch (error) {
      throw new Error(`Failed to save optimization: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async batchSave(records: Array<QueryRecord | ResponseRecord>): Promise<void> {
    try {
      const saveAll = this.db.transaction(() => {
        for (const record of records) {
          if ('query' in record) {
            // Direct insert for queries
            const queryRecord = record as QueryRecord;
            const params = {
              id: queryRecord.id,
              session_id: queryRecord.sessionId,
              timestamp: queryRecord.timestamp,
              query: queryRecord.query,
              model: queryRecord.model,
              category: queryRecord.category || null,
              complexity: queryRecord.complexity || null,
              token_count: queryRecord.tokenCount || null,
              metadata: queryRecord.metadata ? JSON.stringify(queryRecord.metadata) : null
            };
            this.statements.insertQuery.run(params);
          } else {
            // Direct insert for responses
            const responseRecord = record as ResponseRecord;
            const params = {
              id: responseRecord.id,
              query_id: responseRecord.queryId,
              session_id: responseRecord.sessionId,
              timestamp: responseRecord.timestamp,
              response: responseRecord.response || null,
              model: responseRecord.model,
              input_tokens: responseRecord.inputTokens || null,
              output_tokens: responseRecord.outputTokens || null,
              latency_ms: responseRecord.latencyMs || null,
              finish_reason: responseRecord.finishReason || null,
              error: responseRecord.error || null
            };
            this.statements.insertResponse.run(params);
          }
        }
      });

      saveAll();
    } catch (error) {
      throw new Error(`Batch save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getQuery(id: string): Promise<QueryRecord | null> {
    try {
      const row = this.statements.getQuery.get(id) as any;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        query: row.query,
        model: row.model,
        category: row.category,
        complexity: row.complexity,
        tokenCount: row.token_count,
        metadata: row.metadata ? this.parseJSON(row.metadata) : undefined
      };
    } catch (error) {
      throw new Error(`Failed to get query: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getResponse(queryId: string): Promise<ResponseRecord | null> {
    try {
      const row = this.statements.getResponse.get(queryId) as any;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        queryId: row.query_id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        response: row.response,
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        latencyMs: row.latency_ms,
        finishReason: row.finish_reason,
        error: row.error
      };
    } catch (error) {
      throw new Error(`Failed to get response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSessionQueries(sessionId: string): Promise<QueryRecord[]> {
    try {
      const rows = this.statements.getSessionQueries.all(sessionId) as any[];

      return rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        query: row.query,
        model: row.model,
        category: row.category,
        complexity: row.complexity,
        tokenCount: row.token_count,
        metadata: row.metadata ? this.parseJSON(row.metadata) : undefined
      }));
    } catch (error) {
      throw new Error(`Failed to get session queries: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getQueryStats(timeRange?: { start: Date; end: Date }): Promise<QueryStats> {
    try {
      const params = {
        start: timeRange?.start ? timeRange.start.getTime() : null,
        end: timeRange?.end ? timeRange.end.getTime() : null
      };

      // Get aggregate stats
      const statsQuery = timeRange
        ? `SELECT
            COUNT(*) as total_queries,
            SUM(token_count) as total_tokens,
            AVG(r.latency_ms) as avg_latency,
            SUM(CASE WHEN r.error IS NOT NULL THEN 1 ELSE 0 END) as error_count
          FROM queries q
          LEFT JOIN responses r ON q.id = r.query_id
          WHERE q.timestamp >= ? AND q.timestamp <= ?`
        : `SELECT
            COUNT(*) as total_queries,
            SUM(token_count) as total_tokens,
            AVG(r.latency_ms) as avg_latency,
            SUM(CASE WHEN r.error IS NOT NULL THEN 1 ELSE 0 END) as error_count
          FROM queries q
          LEFT JOIN responses r ON q.id = r.query_id`;

      const statsStmt = this.db.prepare(statsQuery);
      const stats = timeRange
        ? statsStmt.get(params.start, params.end) as any
        : statsStmt.get() as any;

      // Get category counts
      const categoryQuery = timeRange
        ? `SELECT category, COUNT(*) as count
           FROM queries
           WHERE timestamp >= ? AND timestamp <= ?
             AND category IS NOT NULL
           GROUP BY category`
        : `SELECT category, COUNT(*) as count
           FROM queries
           WHERE category IS NOT NULL
           GROUP BY category`;

      const categoryStmt = this.db.prepare(categoryQuery);
      const categoryRows = timeRange
        ? categoryStmt.all(params.start, params.end) as any[]
        : categoryStmt.all() as any[];

      const categoryCounts: Record<string, number> = {};
      for (const row of categoryRows) {
        categoryCounts[row.category] = row.count;
      }

      // Get model usage
      const modelQuery = timeRange
        ? `SELECT model, COUNT(*) as count
           FROM queries
           WHERE timestamp >= ? AND timestamp <= ?
             AND model IS NOT NULL
           GROUP BY model`
        : `SELECT model, COUNT(*) as count
           FROM queries
           WHERE model IS NOT NULL
           GROUP BY model`;

      const modelStmt = this.db.prepare(modelQuery);
      const modelRows = timeRange
        ? modelStmt.all(params.start, params.end) as any[]
        : modelStmt.all() as any[];

      const modelUsage: Record<string, number> = {};
      for (const row of modelRows) {
        modelUsage[row.model] = row.count;
      }

      return {
        totalQueries: stats?.total_queries || 0,
        totalTokens: stats?.total_tokens || 0,
        averageLatency: stats?.avg_latency || 0,
        categoryCounts,
        modelUsage,
        errorRate: stats?.total_queries > 0
          ? (stats?.error_count || 0) / stats.total_queries
          : 0
      };
    } catch (error) {
      throw new Error(`Failed to get query stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async close(): Promise<void> {
    try {
      if (this.db) {
        this.db.close();
      }
    } catch (error) {
      // Silently ignore close errors - they're not critical
      // and we don't want to throw during cleanup
    }
  }

  private parseJSON(json: string): any {
    try {
      return JSON.parse(json);
    } catch {
      return undefined;
    }
  }
}