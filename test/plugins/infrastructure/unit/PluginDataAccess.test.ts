import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { PluginDataAccess } from '../../../core/PluginDataAccess';
import { SecurityError, AttachError } from '../../../interfaces/errors';

// Mock better-sqlite3
vi.mock('better-sqlite3');

describe('PluginDataAccess', () => {
  let mockDb: any;
  let dataAccess: PluginDataAccess;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      pragma: vi.fn().mockReturnThis(),
      exec: vi.fn().mockReturnThis(),
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([])
      })
    };

    dataAccess = new PluginDataAccess(mockDb);
  });

  describe('constructor', () => {
    it('should enable WAL mode and set busy timeout', () => {
      expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('busy_timeout = 5000');
    });
  });

  describe('attachReadOnly', () => {
    it('should attach database with read-only mode', async () => {
      const testPath = `${process.env.HOME}/.claudeware/plugins/test/data.db`;
      const alias = 'test';

      await dataAccess.attachReadOnly(testPath, alias);

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining(`ATTACH DATABASE 'file:${testPath}?mode=ro' AS ${alias}`)
      );
      expect(dataAccess.isAttached(alias)).toBe(true);
    });

    it('should throw SecurityError for disallowed paths', async () => {
      const badPath = '/etc/passwd';
      const alias = 'bad';

      await expect(dataAccess.attachReadOnly(badPath, alias))
        .rejects.toThrow(SecurityError);
      
      expect(mockDb.exec).not.toHaveBeenCalled();
    });

    it('should throw AttachError if database is already attached', async () => {
      const testPath = `${process.env.HOME}/.claudeware/plugins/test/data.db`;
      const alias = 'test';

      // First attachment succeeds
      await dataAccess.attachReadOnly(testPath, alias);

      // Second attachment should fail
      await expect(dataAccess.attachReadOnly(testPath, alias))
        .rejects.toThrow(AttachError);
      await expect(dataAccess.attachReadOnly(testPath, alias))
        .rejects.toThrow('Database already attached as test');
    });

    it('should retry on SQLITE_BUSY error', async () => {
      const testPath = `${process.env.HOME}/.claudeware/plugins/test/data.db`;
      const alias = 'test';

      // First attempt fails with SQLITE_BUSY
      mockDb.exec
        .mockRejectedValueOnce({ code: 'SQLITE_BUSY' })
        .mockResolvedValueOnce(undefined);

      await dataAccess.attachReadOnly(testPath, alias);

      // Should have been called twice (initial + 1 retry)
      expect(mockDb.exec).toHaveBeenCalledTimes(2);
      expect(dataAccess.isAttached(alias)).toBe(true);
    });

    it('should fail after max retries on persistent SQLITE_BUSY', async () => {
      const testPath = `${process.env.HOME}/.claudeware/plugins/test/data.db`;
      const alias = 'test';

      // All attempts fail with SQLITE_BUSY
      mockDb.exec.mockRejectedValue({ code: 'SQLITE_BUSY' });

      await expect(dataAccess.attachReadOnly(testPath, alias))
        .rejects.toThrow(AttachError);

      // Should have been called 3 times (initial + 2 retries)
      expect(mockDb.exec).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const testPath = `${process.env.HOME}/.claudeware/plugins/test/data.db`;
      const alias = 'test';

      // Fail with non-retryable error
      const error = new Error('Database corrupted');
      mockDb.exec.mockRejectedValueOnce(error);

      await expect(dataAccess.attachReadOnly(testPath, alias))
        .rejects.toThrow(AttachError);

      // Should only be called once (no retry)
      expect(mockDb.exec).toHaveBeenCalledTimes(1);
    });
  });

  describe('detach', () => {
    it('should detach an attached database', async () => {
      const testPath = `${process.env.HOME}/.claudeware/plugins/test/data.db`;
      const alias = 'test';

      // Attach first
      await dataAccess.attachReadOnly(testPath, alias);
      expect(dataAccess.isAttached(alias)).toBe(true);

      // Then detach
      await dataAccess.detach(alias);

      expect(mockDb.exec).toHaveBeenCalledWith(`DETACH DATABASE ${alias}`);
      expect(dataAccess.isAttached(alias)).toBe(false);
    });

    it('should throw AttachError when detaching non-attached database', async () => {
      await expect(dataAccess.detach('nonexistent'))
        .rejects.toThrow(AttachError);
      await expect(dataAccess.detach('nonexistent'))
        .rejects.toThrow('Database not attached: nonexistent');
    });
  });

  describe('isAttached', () => {
    it('should return false for non-attached databases', () => {
      expect(dataAccess.isAttached('test')).toBe(false);
    });

    it('should return true for attached databases', async () => {
      const testPath = `${process.env.HOME}/.claudeware/plugins/test/data.db`;
      const alias = 'test';

      await dataAccess.attachReadOnly(testPath, alias);
      expect(dataAccess.isAttached(alias)).toBe(true);
    });
  });

  describe('getAttachedDatabases', () => {
    it('should return empty array when no databases attached', () => {
      expect(dataAccess.getAttachedDatabases()).toEqual([]);
    });

    it('should return list of attached database aliases', async () => {
      // Attach multiple databases
      await dataAccess.attachReadOnly(`${process.env.HOME}/.claudeware/plugins/test1/data.db`, 'test1');
      await dataAccess.attachReadOnly(`${process.env.HOME}/.claudeware/plugins/test2/data.db`, 'test2');

      const attached = dataAccess.getAttachedDatabases();
      expect(attached).toHaveLength(2);
      expect(attached).toContain('test1');
      expect(attached).toContain('test2');
    });
  });

  describe('query', () => {
    it('should execute a query and return results', async () => {
      const expectedResults = [{ id: 1, name: 'Test' }];
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue(expectedResults)
      });

      const results = await dataAccess.query('SELECT * FROM users');

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users');
      expect(results).toEqual(expectedResults);
    });

    it('should execute a query with parameters', async () => {
      const expectedResults = [{ id: 1, name: 'Test' }];
      const mockAll = vi.fn().mockReturnValue(expectedResults);
      mockDb.prepare.mockReturnValue({ all: mockAll });

      const results = await dataAccess.query(
        'SELECT * FROM users WHERE id = ?',
        [1]
      );

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?');
      expect(mockAll).toHaveBeenCalledWith(1);
      expect(results).toEqual(expectedResults);
    });

    it('should handle query errors', async () => {
      const error = new Error('SQL syntax error');
      mockDb.prepare.mockImplementation(() => {
        throw error;
      });

      await expect(dataAccess.query('INVALID SQL'))
        .rejects.toThrow('SQL syntax error');
    });
  });

  describe('security validation', () => {
    it('should allow paths within home .claudeware directory', async () => {
      const allowedPaths = [
        `${process.env.HOME}/.claudeware/plugins/test/data.db`,
        `${process.env.HOME}/.claude-code/plugins/test/data.db`
      ];

      for (const path of allowedPaths) {
        await expect(dataAccess.attachReadOnly(path, 'test'))
          .resolves.not.toThrow();
        await dataAccess.detach('test');
      }
    });

    it('should block paths outside allowed directories', async () => {
      const blockedPaths = [
        '/etc/passwd',
        '/var/log/system.log',
        '../../../etc/passwd',
        `${process.env.HOME}/Documents/sensitive.db`
      ];

      for (const path of blockedPaths) {
        await expect(dataAccess.attachReadOnly(path, 'test'))
          .rejects.toThrow(SecurityError);
      }
    });
  });
});