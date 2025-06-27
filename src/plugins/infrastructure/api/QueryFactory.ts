import { IQueryFactory, IPluginQuery } from '../interfaces/api/IQueryFactory';
import { IQueryBuilder } from '../interfaces/api/IQueryBuilder';
import { IPluginDataAccess } from '../interfaces/core/IPluginDataAccess';
import { QueryBuilder } from './QueryBuilder';
import { PermissionError, ValidationError } from '../interfaces/errors';

/**
 * Implementation of IQueryFactory
 * Main entry point for creating query builders
 */
export class QueryFactory implements IQueryFactory {
  constructor(private dataAccess: IPluginDataAccess) {}

  query<T = any>(): IQueryBuilder<T> {
    return new QueryBuilder<T>(this.dataAccess);
  }

  plugin(pluginName: string): IPluginQuery {
    if (!pluginName) {
      throw new ValidationError('Plugin name is required');
    }

    // Validate plugin name format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(pluginName)) {
      throw new ValidationError('Invalid plugin name');
    }

    return new PluginQuery(pluginName, this.dataAccess);
  }

  getDataAccess(): IPluginDataAccess {
    return this.dataAccess;
  }
}

/**
 * Implementation of IPluginQuery
 * Provides plugin-specific query methods
 */
class PluginQuery implements IPluginQuery {
  constructor(
    private pluginName: string,
    private dataAccess: IPluginDataAccess
  ) {}

  table<T = any>(tableName: string): IQueryBuilder<T> {
    // Check if the plugin database is attached
    if (!this.dataAccess.isAttached(this.pluginName)) {
      throw new PermissionError(`Plugin ${this.pluginName} is not attached`);
    }

    // Create query builder with database prefix
    const builder = new QueryBuilder<T>(this.dataAccess);
    return builder.from(tableName, this.pluginName);
  }

  async raw<T = any>(sql: string, params?: any[]): Promise<T[]> {
    // Check if the plugin database is attached
    if (!this.dataAccess.isAttached(this.pluginName)) {
      throw new PermissionError(`Plugin ${this.pluginName} is not attached`);
    }

    // Execute raw SQL (user is responsible for SQL injection prevention)
    return this.dataAccess.query<T>(sql, params);
  }

  getName(): string {
    return this.pluginName;
  }
}