import type { Database } from 'better-sqlite3';
import * as path from 'path';
import { SecurityError, AttachError } from '../interfaces/errors';

/**
 * Implementation of IPluginDataAccess
 * Manages SQLite database attachments with security and retry logic
 */
export class PluginDataAccess {
  private db: Database;
  private attachedDbs: Map<string, string> = new Map();
  private maxRetries = 3;
  private retryDelay = 100; // ms

  constructor(db: Database) {
    this.db = db;
    // Enable WAL mode for concurrent access
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
  }

  async attachReadOnly(dbPath: string, alias: string): Promise<void> {
    // Security: Validate path is within allowed directories
    const resolvedPath = path.resolve(dbPath);
    if (!this.isPathAllowed(resolvedPath)) {
      throw new SecurityError(`Access denied: ${dbPath}`);
    }

    // Prevent double-attach
    if (this.attachedDbs.has(alias)) {
      throw new AttachError(`Database already attached as ${alias}`);
    }

    // Attempt attachment with retry logic
    let lastError: Error | null = null;

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        // ATTACH with read-only mode
        await this.db.exec(`ATTACH DATABASE '${resolvedPath}' AS ${alias}`);
        this.attachedDbs.set(alias, resolvedPath);
        return; // Success
      } catch (error: any) {
        lastError = error;

        // Retry on transient errors
        if (this.isRetryableError(error) && i < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (i + 1));
          continue;
        }

        // Fail fast on permanent errors
        throw new AttachError(error.message, error.code);
      }
    }

    // All retries exhausted
    throw new AttachError(lastError!.message, (lastError as any).code);
  }

  async detach(alias: string): Promise<void> {
    if (!this.attachedDbs.has(alias)) {
      throw new AttachError(`Database not attached: ${alias}`);
    }

    try {
      await this.db.exec(`DETACH DATABASE ${alias}`);
      this.attachedDbs.delete(alias);
    } catch (error: any) {
      throw new AttachError(`Failed to detach ${alias}: ${error.message}`, error.code);
    }
  }

  isAttached(alias: string): boolean {
    return this.attachedDbs.has(alias);
  }

  getAttachedDatabases(): string[] {
    return Array.from(this.attachedDbs.keys());
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      const trimmedSql = sql.trim().toUpperCase();

      // Check if this is a SELECT query
      if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH') || trimmedSql.startsWith('PRAGMA')) {
        if (params && params.length > 0) {
          return stmt.all(...params) as T[];
        }
        return stmt.all() as T[];
      } else {
        // For non-SELECT queries (INSERT, UPDATE, DELETE, etc.), use run()
        if (params && params.length > 0) {
          stmt.run(...params);
        } else {
          stmt.run();
        }
        return []; // Return empty array for non-SELECT queries
      }
    } catch (error: any) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  private isPathAllowed(dbPath: string): boolean {
    // Must be absolute path
    if (!path.isAbsolute(dbPath)) {
      throw new SecurityError('Path must be absolute');
    }

    // Resolve to prevent path traversal
    const resolved = path.resolve(dbPath);

    // Check if path contains traversal attempts
    if (resolved.includes('..')) {
      return false;
    }

    // Define allowed base paths
    const allowedPaths = [
      path.join(process.env.HOME || '', '.claude-code'),
      path.join(process.env.HOME || '', '.claudeware')
    ];

    // Check if path starts with any allowed base path
    return allowedPaths.some(allowed => resolved.startsWith(allowed));
  }

  private isRetryableError(error: any): boolean {
    const retryableCodes = ['SQLITE_BUSY', 'SQLITE_LOCKED'];
    return retryableCodes.includes(error.code);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}