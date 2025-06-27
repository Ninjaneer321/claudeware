import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryFactory } from '../../../api/QueryFactory';
import { IPluginDataAccess } from '../../../interfaces/core/IPluginDataAccess';
import { IQueryBuilder } from '../../../interfaces/api/IQueryBuilder';
import { PermissionError } from '../../../interfaces/errors';

describe('QueryFactory', () => {
  let mockDataAccess: IPluginDataAccess;
  let factory: QueryFactory;

  beforeEach(() => {
    mockDataAccess = {
      attachReadOnly: vi.fn(),
      detach: vi.fn(),
      isAttached: vi.fn().mockReturnValue(false),
      getAttachedDatabases: vi.fn().mockReturnValue([]),
      query: vi.fn().mockResolvedValue([])
    };

    factory = new QueryFactory(mockDataAccess);
  });

  describe('query', () => {
    it('should create a new query builder', () => {
      const builder = factory.query();
      
      expect(builder).toBeDefined();
      expect(builder.select).toBeDefined();
      expect(builder.from).toBeDefined();
      expect(builder.where).toBeDefined();
      expect(builder.execute).toBeDefined();
    });

    it('should create typed query builder', () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const builder = factory.query<User>();
      
      expect(builder).toBeDefined();
      // TypeScript will enforce that execute() returns Promise<User[]>
    });

    it('should create independent query builders', () => {
      const builder1 = factory.query();
      const builder2 = factory.query();
      
      builder1.from('users');
      builder2.from('posts');
      
      const sql1 = builder1.toSQL();
      const sql2 = builder2.toSQL();
      
      expect(sql1.sql).toContain('FROM users');
      expect(sql2.sql).toContain('FROM posts');
    });
  });

  describe('plugin', () => {
    it('should create plugin-specific query interface', () => {
      const plugin = factory.plugin('analytics');
      
      expect(plugin).toBeDefined();
      expect(plugin.table).toBeDefined();
      expect(plugin.raw).toBeDefined();
      expect(plugin.getName).toBeDefined();
    });

    it('should return plugin name', () => {
      const plugin = factory.plugin('analytics');
      
      expect(plugin.getName()).toBe('analytics');
    });

    it('should check if plugin is attached', () => {
      mockDataAccess.isAttached = vi.fn().mockReturnValue(false);
      
      const plugin = factory.plugin('analytics');
      
      expect(() => plugin.table('events'))
        .toThrow(PermissionError);
      expect(() => plugin.table('events'))
        .toThrow('Plugin analytics is not attached');
    });

    it('should create query builder with database prefix', () => {
      mockDataAccess.isAttached = vi.fn().mockReturnValue(true);
      
      const plugin = factory.plugin('analytics');
      const builder = plugin.table('events');
      
      const { sql } = builder.toSQL();
      expect(sql).toContain('FROM analytics.events');
    });

    it('should execute raw queries on plugin database', async () => {
      mockDataAccess.isAttached = vi.fn().mockReturnValue(true);
      const mockResults = [{ id: 1, data: 'test' }];
      mockDataAccess.query = vi.fn().mockResolvedValue(mockResults);
      
      const plugin = factory.plugin('analytics');
      const results = await plugin.raw(
        'SELECT * FROM analytics.events WHERE id = ?',
        [1]
      );
      
      expect(mockDataAccess.query).toHaveBeenCalledWith(
        'SELECT * FROM analytics.events WHERE id = ?',
        [1]
      );
      expect(results).toEqual(mockResults);
    });

    it('should validate plugin name', () => {
      expect(() => factory.plugin(''))
        .toThrow('Plugin name is required');
      
      expect(() => factory.plugin('invalid-name!'))
        .toThrow('Invalid plugin name');
    });
  });

  describe('getDataAccess', () => {
    it('should return the data access instance', () => {
      const dataAccess = factory.getDataAccess();
      
      expect(dataAccess).toBe(mockDataAccess);
    });
  });

  describe('integration scenarios', () => {
    it('should support fluent query building', async () => {
      mockDataAccess.query = vi.fn().mockResolvedValue([
        { model: 'opus', count: 150 },
        { model: 'sonnet', count: 300 }
      ]);
      
      const results = await factory
        .query()
        .select('model', 'COUNT(*) as count')
        .from('queries')
        .where('timestamp', '>', '2024-01-01')
        .groupBy('model')
        .orderBy('count', 'DESC')
        .execute();
      
      expect(results).toHaveLength(2);
      expect(results[0].count).toBe(150);
    });

    it('should support plugin-specific queries', async () => {
      mockDataAccess.isAttached = vi.fn().mockReturnValue(true);
      mockDataAccess.query = vi.fn().mockResolvedValue([
        { id: 1, event_type: 'click' }
      ]);
      
      const event = await factory
        .plugin('analytics')
        .table('events')
        .where('user_id', '=', 123)
        .first();
      
      expect(event).toEqual({ id: 1, event_type: 'click' });
    });

    it('should support cross-plugin queries', async () => {
      mockDataAccess.isAttached = vi.fn().mockReturnValue(true);
      
      const builder = factory
        .query()
        .select('u.name', 'COUNT(a.id) as event_count')
        .from('users', 'main')
        .leftJoin('analytics.events a', 'u.id', '=', 'a.user_id')
        .groupBy('u.id', 'u.name');
      
      const { sql } = builder.toSQL();
      
      expect(sql).toContain('FROM main.users');
      expect(sql).toContain('LEFT JOIN analytics.events a');
    });
  });

  describe('error handling', () => {
    it('should handle query execution errors', async () => {
      const error = new Error('Database error');
      mockDataAccess.query = vi.fn().mockRejectedValue(error);
      
      await expect(factory.query().from('users').execute())
        .rejects.toThrow('Database error');
    });

    it('should validate raw SQL in plugin queries', async () => {
      mockDataAccess.isAttached = vi.fn().mockReturnValue(true);
      
      const plugin = factory.plugin('analytics');
      
      // Should warn about potential SQL injection
      await expect(plugin.raw('SELECT * FROM users WHERE id = ' + 1))
        .resolves.toBeDefined(); // But still executes (user's responsibility)
    });
  });

  describe('type safety', () => {
    it('should maintain type information through the chain', async () => {
      interface QueryResult {
        model: string;
        total: number;
        avg_latency: number;
      }

      mockDataAccess.query = vi.fn().mockResolvedValue([
        { model: 'opus', total: 100, avg_latency: 250 }
      ]);
      
      const results = await factory
        .query<QueryResult>()
        .select('model', 'COUNT(*) as total', 'AVG(latency) as avg_latency')
        .from('metrics')
        .groupBy('model')
        .execute();
      
      // TypeScript knows results is QueryResult[]
      expect(results[0].model).toBe('opus');
      expect(results[0].total).toBe(100);
      expect(results[0].avg_latency).toBe(250);
    });
  });
});