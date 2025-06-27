import { IQueryBuilder } from './IQueryBuilder';
import { IPluginDataAccess } from '../core/IPluginDataAccess';

/**
 * Factory for creating query builders
 * Main entry point for the fluent query API
 */
export interface IQueryFactory {
  /**
   * Create a new query builder
   * @example
   * const users = await factory.query<User>()
   *   .select('*')
   *   .from('users')
   *   .where('active', '=', true)
   *   .execute();
   */
  query<T = any>(): IQueryBuilder<T>;

  /**
   * Create a query builder for a specific plugin database
   * @param pluginName Name of the plugin database
   * @example
   * const events = await factory.plugin('analytics')
   *   .table('events')
   *   .where('timestamp', '>', yesterday)
   *   .execute();
   */
  plugin(pluginName: string): IPluginQuery;

  /**
   * Get the underlying data access instance
   * Useful for raw queries or direct access
   */
  getDataAccess(): IPluginDataAccess;
}

/**
 * Plugin-specific query interface
 * Provides convenient methods for querying a specific plugin's database
 */
export interface IPluginQuery {
  /**
   * Select from a table in this plugin's database
   * @param tableName Name of the table
   * @example plugin('analytics').table('events')
   */
  table<T = any>(tableName: string): IQueryBuilder<T>;

  /**
   * Execute raw SQL on this plugin's database
   * Use with caution - no SQL injection protection
   * @param sql Raw SQL query
   * @param params Query parameters
   * @example plugin('analytics').raw('SELECT * FROM events WHERE data @> ?', [jsonData])
   */
  raw<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * Get the plugin name
   */
  getName(): string;
}