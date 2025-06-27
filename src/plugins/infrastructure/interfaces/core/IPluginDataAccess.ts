/**
 * Core interface for plugin data access operations
 * Manages SQLite database attachments and queries
 */
export interface IPluginDataAccess {
  /**
   * Attach a database in read-only mode
   * @param dbPath Absolute path to the SQLite database
   * @param alias Alias for the attached database
   * @throws {SecurityError} If path is not allowed
   * @throws {AttachError} If attachment fails
   */
  attachReadOnly(dbPath: string, alias: string): Promise<void>;

  /**
   * Detach a previously attached database
   * @param alias Alias of the database to detach
   * @throws {AttachError} If detachment fails
   */
  detach(alias: string): Promise<void>;

  /**
   * Check if a database is attached
   * @param alias Alias to check
   */
  isAttached(alias: string): boolean;

  /**
   * Get list of attached database aliases
   */
  getAttachedDatabases(): string[];

  /**
   * Execute a raw SQL query
   * @param sql SQL query to execute
   * @param params Query parameters
   * @returns Array of result rows
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}