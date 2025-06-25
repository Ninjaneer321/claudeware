import Database from 'better-sqlite3';
import { SqliteAdapter } from '../../src/database/sqlite-adapter';
import { QueryRecord, ResponseRecord } from '../../src/types';

// Mock better-sqlite3
jest.mock('better-sqlite3');

describe('SqliteAdapter', () => {
  let adapter: SqliteAdapter;
  let mockDb: jest.Mocked<Database.Database>;
  let mockStatements: Record<string, jest.Mocked<Database.Statement>>;
  const testDbPath = '/tmp/test.db';

  beforeEach(() => {
    // Setup mock statements
    mockStatements = {
      insertQuery: {
        run: jest.fn().mockReturnValue({ changes: 1 })
      } as any,
      insertResponse: {
        run: jest.fn().mockReturnValue({ changes: 1 })
      } as any,
      insertOptimization: {
        run: jest.fn().mockReturnValue({ changes: 1 })
      } as any,
      getQuery: {
        get: jest.fn()
      } as any,
      getResponse: {
        get: jest.fn()
      } as any,
      getSessionQueries: {
        all: jest.fn()
      } as any,
      getStats: {
        get: jest.fn()
      } as any
    };

    // Setup mock database
    mockDb = {
      prepare: jest.fn((sql: string) => {
        if (sql.includes('INSERT INTO queries')) return mockStatements.insertQuery;
        if (sql.includes('INSERT INTO responses')) return mockStatements.insertResponse;
        if (sql.includes('INSERT INTO optimizations')) return mockStatements.insertOptimization;
        if (sql.includes('SELECT * FROM queries WHERE id')) return mockStatements.getQuery;
        if (sql.includes('SELECT * FROM responses WHERE query_id')) return mockStatements.getResponse;
        if (sql.includes('SELECT * FROM queries WHERE session_id')) return mockStatements.getSessionQueries;
        if (sql.includes('COUNT(*) as total_queries')) return mockStatements.getStats;
        return { run: jest.fn() } as any;
      }),
      exec: jest.fn(),
      pragma: jest.fn(),
      transaction: jest.fn((fn) => fn),
      close: jest.fn()
    } as any;

    (Database as any).mockReturnValue(mockDb);
    adapter = new SqliteAdapter({ path: testDbPath });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create database and tables', async () => {
      await adapter.init();

      expect(Database).toHaveBeenCalledWith(testDbPath);
      expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('busy_timeout = 5000');
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS queries'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS responses'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS optimizations'));
    });

    it('should create indices', async () => {
      await adapter.init();

      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_session_id'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_timestamp'));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_category'));
    });

    it('should prepare statements', async () => {
      await adapter.init();

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO queries'));
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO responses'));
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO optimizations'));
    });

    it('should handle initialization errors', async () => {
      mockDb.exec.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(adapter.init()).rejects.toThrow('Failed to initialize database');
    });
  });

  describe('saveQuery', () => {
    const testQuery: QueryRecord = {
      id: 'query-123',
      sessionId: 'session-456',
      timestamp: Date.now(),
      query: 'Test query',
      model: 'claude-3',
      category: 'code',
      complexity: 'medium',
      tokenCount: 100
    };

    beforeEach(async () => {
      await adapter.init();
    });

    it('should save query record', async () => {
      await adapter.saveQuery(testQuery);

      expect(mockStatements.insertQuery.run).toHaveBeenCalledWith({
        id: testQuery.id,
        session_id: testQuery.sessionId,
        timestamp: testQuery.timestamp,
        query: testQuery.query,
        model: testQuery.model,
        category: testQuery.category,
        complexity: testQuery.complexity,
        token_count: testQuery.tokenCount,
        metadata: null
      });
    });

    it('should save metadata as JSON', async () => {
      const queryWithMetadata = {
        ...testQuery,
        metadata: { tags: ['test', 'example'] }
      };

      await adapter.saveQuery(queryWithMetadata);

      expect(mockStatements.insertQuery.run).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: JSON.stringify(queryWithMetadata.metadata)
        })
      );
    });

    it('should handle save errors', async () => {
      mockStatements.insertQuery.run.mockImplementation(() => {
        throw new Error('Insert failed');
      });

      await expect(adapter.saveQuery(testQuery)).rejects.toThrow('Failed to save query');
    });
  });

  describe('saveResponse', () => {
    const testResponse: ResponseRecord = {
      id: 'response-123',
      queryId: 'query-123',
      sessionId: 'session-456',
      timestamp: Date.now(),
      response: 'Test response',
      model: 'claude-3',
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 1500,
      finishReason: 'stop'
    };

    beforeEach(async () => {
      await adapter.init();
    });

    it('should save response record', async () => {
      await adapter.saveResponse(testResponse);

      expect(mockStatements.insertResponse.run).toHaveBeenCalledWith({
        id: testResponse.id,
        query_id: testResponse.queryId,
        session_id: testResponse.sessionId,
        timestamp: testResponse.timestamp,
        response: testResponse.response,
        model: testResponse.model,
        input_tokens: testResponse.inputTokens,
        output_tokens: testResponse.outputTokens,
        latency_ms: testResponse.latencyMs,
        finish_reason: testResponse.finishReason,
        error: null
      });
    });

    it('should save error responses', async () => {
      const errorResponse = {
        ...testResponse,
        response: '',
        error: 'API timeout'
      };

      await adapter.saveResponse(errorResponse);

      expect(mockStatements.insertResponse.run).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'API timeout'
        })
      );
    });
  });

  describe('batchSave', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should save multiple records in a transaction', async () => {
      const records = [
        {
          id: 'query-1',
          sessionId: 'session-1',
          timestamp: Date.now(),
          query: 'Query 1',
          model: 'claude-3'
        } as QueryRecord,
        {
          id: 'response-1',
          queryId: 'query-1',
          sessionId: 'session-1',
          timestamp: Date.now(),
          response: 'Response 1',
          model: 'claude-3'
        } as ResponseRecord
      ];

      await adapter.batchSave(records);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockStatements.insertQuery.run).toHaveBeenCalledTimes(1);
      expect(mockStatements.insertResponse.run).toHaveBeenCalledTimes(1);
    });

    it('should rollback transaction on error', async () => {
      mockStatements.insertQuery.run.mockImplementationOnce(() => {
        throw new Error('Insert failed');
      });

      const records = [
        {
          id: 'query-1',
          sessionId: 'session-1',
          timestamp: Date.now(),
          query: 'Query 1',
          model: 'claude-3'
        } as QueryRecord
      ];

      await expect(adapter.batchSave(records)).rejects.toThrow('Batch save failed');
    });
  });

  describe('query operations', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should get query by id', async () => {
      const mockQuery = {
        id: 'query-123',
        session_id: 'session-456',
        timestamp: Date.now(),
        query: 'Test query',
        model: 'claude-3',
        category: 'code',
        complexity: 'medium',
        token_count: 100,
        metadata: null
      };

      mockStatements.getQuery.get.mockReturnValue(mockQuery);

      const result = await adapter.getQuery('query-123');

      expect(mockStatements.getQuery.get).toHaveBeenCalledWith('query-123');
      expect(result).toEqual({
        id: mockQuery.id,
        sessionId: mockQuery.session_id,
        timestamp: mockQuery.timestamp,
        query: mockQuery.query,
        model: mockQuery.model,
        category: mockQuery.category,
        complexity: mockQuery.complexity,
        tokenCount: mockQuery.token_count,
        metadata: undefined
      });
    });

    it('should parse metadata JSON', async () => {
      const mockQuery = {
        id: 'query-123',
        session_id: 'session-456',
        timestamp: Date.now(),
        query: 'Test query',
        model: 'claude-3',
        metadata: JSON.stringify({ tags: ['test'] })
      };

      mockStatements.getQuery.get.mockReturnValue(mockQuery);

      const result = await adapter.getQuery('query-123');

      expect(result?.metadata).toEqual({ tags: ['test'] });
    });

    it('should return null for non-existent query', async () => {
      mockStatements.getQuery.get.mockReturnValue(undefined);

      const result = await adapter.getQuery('non-existent');

      expect(result).toBeNull();
    });

    it('should get session queries', async () => {
      const mockQueries = [
        {
          id: 'query-1',
          session_id: 'session-456',
          timestamp: Date.now() - 1000,
          query: 'Query 1',
          model: 'claude-3'
        },
        {
          id: 'query-2',
          session_id: 'session-456',
          timestamp: Date.now(),
          query: 'Query 2',
          model: 'claude-3'
        }
      ];

      mockStatements.getSessionQueries.all.mockReturnValue(mockQueries);

      const results = await adapter.getSessionQueries('session-456');

      expect(mockStatements.getSessionQueries.all).toHaveBeenCalledWith('session-456');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('query-1');
    });
  });

  describe('analytics', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should get query statistics', async () => {
      const mockStats = {
        total_queries: 100,
        total_tokens: 50000,
        avg_latency: 1200.5,
        error_count: 5
      };

      const mockCategoryCounts = [
        { category: 'code', count: 40 },
        { category: 'text', count: 30 },
        { category: 'debug', count: 30 }
      ];

      const mockModelUsage = [
        { model: 'claude-3', count: 80 },
        { model: 'claude-2', count: 20 }
      ];

      mockStatements.getStats.get.mockReturnValue(mockStats);
      
      const categoryStmt = { all: jest.fn().mockReturnValue(mockCategoryCounts) };
      const modelStmt = { all: jest.fn().mockReturnValue(mockModelUsage) };
      
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('GROUP BY category')) return categoryStmt as any;
        if (sql.includes('GROUP BY model')) return modelStmt as any;
        return mockStatements.getStats as any;
      });

      const stats = await adapter.getQueryStats();

      expect(stats).toEqual({
        totalQueries: 100,
        totalTokens: 50000,
        averageLatency: 1200.5,
        categoryCounts: {
          code: 40,
          text: 30,
          debug: 30
        },
        modelUsage: {
          'claude-3': 80,
          'claude-2': 20
        },
        errorRate: 0.05
      });
    });

    it('should handle date range filtering', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      // Set up mocks for the prepare calls
      const statsStmt = { get: jest.fn().mockReturnValue({ total_queries: 10, total_tokens: 1000, avg_latency: 100, error_count: 0 }) };
      const categoryStmt = { all: jest.fn().mockReturnValue([]) };
      const modelStmt = { all: jest.fn().mockReturnValue([]) };
      
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('GROUP BY category')) return categoryStmt as any;
        if (sql.includes('GROUP BY model')) return modelStmt as any;
        return statsStmt as any;
      });

      await adapter.getQueryStats(timeRange);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE q.timestamp >= ? AND q.timestamp <= ?')
      );
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should close database connection', async () => {
      await adapter.close();

      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockDb.close.mockImplementation(() => {
        throw new Error('Close failed');
      });

      // Should not throw
      await adapter.close();

      expect(mockDb.close).toHaveBeenCalled();
    });
  });
});