import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryBuilder } from '../../../api/QueryBuilder';
import { IPluginDataAccess } from '../../../interfaces/core/IPluginDataAccess';
import { ValidationError } from '../../../interfaces/errors';

describe('QueryBuilder', () => {
  let mockDataAccess: IPluginDataAccess;
  let queryBuilder: QueryBuilder;

  beforeEach(() => {
    mockDataAccess = {
      attachReadOnly: vi.fn(),
      detach: vi.fn(),
      isAttached: vi.fn(),
      getAttachedDatabases: vi.fn(),
      query: vi.fn().mockResolvedValue([])
    };

    queryBuilder = new QueryBuilder(mockDataAccess);
  });

  describe('select', () => {
    it('should set select columns', () => {
      queryBuilder.select('id', 'name', 'email').from('users');
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('SELECT id, name, email');
    });

    it('should default to SELECT * when no columns specified', () => {
      queryBuilder.from('users');
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('SELECT *');
    });

    it('should handle column aliases', () => {
      queryBuilder.select('id', 'name AS full_name', 'COUNT(*) as total').from('users');
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('SELECT id, name AS full_name, COUNT(*) as total');
    });

    it('should support method chaining', () => {
      const result = queryBuilder
        .select('id', 'name')
        .from('users');
      
      expect(result).toBe(queryBuilder);
    });
  });

  describe('from', () => {
    it('should set the FROM clause', () => {
      queryBuilder.from('users');
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('FROM users');
    });

    it('should support database prefix', () => {
      queryBuilder.from('users', 'analytics');
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('FROM analytics.users');
    });

    it('should throw error when building without FROM', () => {
      queryBuilder.select('*');
      
      expect(() => queryBuilder.toSQL()).toThrow('FROM clause is required');
    });

    it('should sanitize table names', () => {
      expect(() => queryBuilder.from('users; DROP TABLE users--'))
        .toThrow(ValidationError);
    });
  });

  describe('where', () => {
    it('should add basic WHERE clause', () => {
      queryBuilder
        .from('users')
        .where('age', '>', 18);
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE age > ?');
      expect(params).toEqual([18]);
    });

    it('should chain multiple WHERE clauses with AND', () => {
      queryBuilder
        .from('users')
        .where('age', '>', 18)
        .where('status', '=', 'active');
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE age > ? AND status = ?');
      expect(params).toEqual([18, 'active']);
    });

    it('should support andWhere alias', () => {
      queryBuilder
        .from('users')
        .where('age', '>', 18)
        .andWhere('status', '=', 'active');
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE age > ? AND status = ?');
      expect(params).toEqual([18, 'active']);
    });

    it('should support OR conditions', () => {
      queryBuilder
        .from('users')
        .where('role', '=', 'admin')
        .orWhere('role', '=', 'moderator');
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE role = ? OR role = ?');
      expect(params).toEqual(['admin', 'moderator']);
    });

    it('should handle NULL comparisons', () => {
      queryBuilder
        .from('users')
        .whereNull('deleted_at');
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE deleted_at IS NULL');
      expect(params).toEqual([]);
    });

    it('should handle NOT NULL comparisons', () => {
      queryBuilder
        .from('users')
        .whereNotNull('email_verified_at');
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE email_verified_at IS NOT NULL');
      expect(params).toEqual([]);
    });
  });

  describe('whereIn / whereNotIn', () => {
    it('should handle WHERE IN clause', () => {
      queryBuilder
        .from('users')
        .whereIn('status', ['active', 'pending', 'suspended']);
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE status IN (?, ?, ?)');
      expect(params).toEqual(['active', 'pending', 'suspended']);
    });

    it('should handle WHERE NOT IN clause', () => {
      queryBuilder
        .from('users')
        .whereNotIn('role', ['admin', 'superuser']);
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('WHERE role NOT IN (?, ?)');
      expect(params).toEqual(['admin', 'superuser']);
    });

    it('should throw error for empty IN array', () => {
      expect(() => queryBuilder.whereIn('status', []))
        .toThrow('IN clause requires at least one value');
    });
  });

  describe('join operations', () => {
    it('should handle basic JOIN', () => {
      queryBuilder
        .select('users.*, posts.title')
        .from('users')
        .join('posts', 'users.id', '=', 'posts.user_id');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('JOIN posts ON users.id = posts.user_id');
    });

    it('should handle LEFT JOIN', () => {
      queryBuilder
        .from('users')
        .leftJoin('posts', 'users.id', '=', 'posts.user_id');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('LEFT JOIN posts ON users.id = posts.user_id');
    });

    it('should handle cross-database joins', () => {
      queryBuilder
        .from('users', 'main')
        .leftJoin('analytics.events', 'users.id', '=', 'events.user_id');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('FROM main.users');
      expect(sql).toContain('LEFT JOIN analytics.events ON users.id = events.user_id');
    });

    it('should support table aliases in joins', () => {
      queryBuilder
        .select('u.*, COUNT(p.id) as post_count')
        .from('users u')
        .leftJoin('posts p', 'u.id', '=', 'p.user_id')
        .groupBy('u.id');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('FROM users u');
      expect(sql).toContain('LEFT JOIN posts p');
    });
  });

  describe('groupBy and having', () => {
    it('should handle GROUP BY', () => {
      queryBuilder
        .select('category', 'COUNT(*) as count')
        .from('products')
        .groupBy('category');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('GROUP BY category');
    });

    it('should handle multiple GROUP BY columns', () => {
      queryBuilder
        .from('orders')
        .groupBy('customer_id', 'status');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('GROUP BY customer_id, status');
    });

    it('should handle HAVING clause', () => {
      queryBuilder
        .select('category', 'COUNT(*) as count')
        .from('products')
        .groupBy('category')
        .having('COUNT(*)', '>', 5);
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('HAVING COUNT(*) > ?');
      expect(params).toContain(5);
    });
  });

  describe('orderBy', () => {
    it('should handle ORDER BY with default ASC', () => {
      queryBuilder
        .from('users')
        .orderBy('created_at');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('ORDER BY created_at ASC');
    });

    it('should handle ORDER BY DESC', () => {
      queryBuilder
        .from('users')
        .orderBy('created_at', 'DESC');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('ORDER BY created_at DESC');
    });

    it('should handle multiple ORDER BY clauses', () => {
      queryBuilder
        .from('users')
        .orderBy('last_name', 'ASC')
        .orderBy('first_name', 'ASC');
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('ORDER BY last_name ASC, first_name ASC');
    });
  });

  describe('limit and offset', () => {
    it('should handle LIMIT', () => {
      queryBuilder
        .from('users')
        .limit(10);
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('LIMIT 10');
    });

    it('should handle OFFSET', () => {
      queryBuilder
        .from('users')
        .offset(20);
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('OFFSET 20');
    });

    it('should handle pagination pattern', () => {
      queryBuilder
        .from('users')
        .orderBy('id')
        .limit(10)
        .offset(20);
      
      const { sql } = queryBuilder.toSQL();
      
      expect(sql).toContain('LIMIT 10 OFFSET 20');
    });

    it('should validate positive numbers', () => {
      expect(() => queryBuilder.limit(-1))
        .toThrow('LIMIT must be a positive number');
      
      expect(() => queryBuilder.offset(-1))
        .toThrow('OFFSET must be a positive number');
    });
  });

  describe('execution methods', () => {
    it('should execute query and return results', async () => {
      const mockResults = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];
      mockDataAccess.query = vi.fn().mockResolvedValue(mockResults);
      
      const results = await queryBuilder
        .from('users')
        .execute();
      
      expect(mockDataAccess.query).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
    });

    it('should return first result', async () => {
      const mockResults = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];
      mockDataAccess.query = vi.fn().mockResolvedValue(mockResults);
      
      const result = await queryBuilder
        .from('users')
        .first();
      
      expect(result).toEqual({ id: 1, name: 'John' });
    });

    it('should return null when no first result', async () => {
      mockDataAccess.query = vi.fn().mockResolvedValue([]);
      
      const result = await queryBuilder
        .from('users')
        .first();
      
      expect(result).toBeNull();
    });

    it('should return count', async () => {
      mockDataAccess.query = vi.fn().mockResolvedValue([{ count: 42 }]);
      
      const count = await queryBuilder
        .from('users')
        .count();
      
      expect(count).toBe(42);
    });

    it('should check existence', async () => {
      mockDataAccess.query = vi.fn().mockResolvedValue([{ count: 1 }]);
      
      const exists = await queryBuilder
        .from('users')
        .where('email', '=', 'test@example.com')
        .exists();
      
      expect(exists).toBe(true);
    });
  });

  describe('complex queries', () => {
    it('should build complex cross-database query', () => {
      queryBuilder
        .select('o.model', 'COUNT(DISTINCT a.user_id) as unique_users')
        .from('queries', 'optimizer')
        .leftJoin('analytics.events a', 'o.id', '=', 'a.query_id')
        .where('o.timestamp', '>', '2024-01-01')
        .andWhere('o.status', '=', 'completed')
        .whereIn('o.model', ['opus', 'sonnet'])
        .groupBy('o.model')
        .having('COUNT(DISTINCT a.user_id)', '>', 10)
        .orderBy('unique_users', 'DESC')
        .limit(5);
      
      const { sql, params } = queryBuilder.toSQL();
      
      expect(sql).toContain('SELECT o.model, COUNT(DISTINCT a.user_id) as unique_users');
      expect(sql).toContain('FROM optimizer.queries');
      expect(sql).toContain('LEFT JOIN analytics.events a');
      expect(sql).toContain('WHERE o.timestamp > ?');
      expect(sql).toContain('AND o.status = ?');
      expect(sql).toContain('AND o.model IN (?, ?)');
      expect(sql).toContain('GROUP BY o.model');
      expect(sql).toContain('HAVING COUNT(DISTINCT a.user_id) > ?');
      expect(sql).toContain('ORDER BY unique_users DESC');
      expect(sql).toContain('LIMIT 5');
      
      expect(params).toEqual(['2024-01-01', 'completed', 'opus', 'sonnet', 10]);
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      queryBuilder
        .from('users')
        .where('active', '=', true);
      
      const clone = queryBuilder.clone();
      clone.where('role', '=', 'admin');
      
      const original = queryBuilder.toSQL();
      const cloned = clone.toSQL();
      
      expect(original.sql).not.toContain('role');
      expect(cloned.sql).toContain('role');
    });
  });

  describe('error handling', () => {
    it('should provide helpful error for missing FROM', () => {
      queryBuilder.select('*');
      
      expect(() => queryBuilder.toSQL())
        .toThrow('FROM clause is required');
    });

    it('should validate operators', () => {
      expect(() => queryBuilder.where('id', 'INVALID', 1))
        .toThrow('Invalid operator: INVALID');
    });

    it('should prevent SQL injection in identifiers', () => {
      expect(() => queryBuilder.from('users; DROP TABLE users--'))
        .toThrow(ValidationError);
      
      expect(() => queryBuilder.select('*; DROP TABLE users--'))
        .toThrow(ValidationError);
    });
  });
});