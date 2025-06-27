import { ComparisonOperator, SortDirection, SqlInfo } from './types';

/**
 * Fluent interface for building SQL queries
 * Supports method chaining and cross-database queries
 */
export interface IQueryBuilder<T = any> {
  /**
   * Select columns to retrieve
   * @param columns Column names or expressions
   * @example .select('id', 'name', 'created_at')
   * @example .select('users.*', 'COUNT(posts.id) as post_count')
   */
  select(...columns: string[]): IQueryBuilder<T>;

  /**
   * Set the table to query from
   * @param table Table name
   * @param database Optional database alias for cross-database queries
   * @example .from('users')
   * @example .from('users', 'analytics') // analytics.users
   */
  from(table: string, database?: string): IQueryBuilder<T>;

  /**
   * Add WHERE condition
   * @param column Column name or expression
   * @param operator Comparison operator
   * @param value Value to compare
   * @example .where('age', '>', 18)
   * @example .where('status', '=', 'active')
   */
  where(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T>;

  /**
   * Add AND WHERE condition
   * Alias for where() when chaining conditions
   */
  andWhere(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T>;

  /**
   * Add OR WHERE condition
   */
  orWhere(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T>;

  /**
   * Add WHERE IN condition
   * @example .whereIn('status', ['active', 'pending'])
   */
  whereIn(column: string, values: any[]): IQueryBuilder<T>;

  /**
   * Add WHERE NOT IN condition
   * @example .whereNotIn('role', ['admin', 'superuser'])
   */
  whereNotIn(column: string, values: any[]): IQueryBuilder<T>;

  /**
   * Add WHERE NULL condition
   * @example .whereNull('deleted_at')
   */
  whereNull(column: string): IQueryBuilder<T>;

  /**
   * Add WHERE NOT NULL condition
   * @example .whereNotNull('email_verified_at')
   */
  whereNotNull(column: string): IQueryBuilder<T>;

  /**
   * Add JOIN clause
   * @param table Table to join (can include database prefix)
   * @param leftKey Left side of join condition
   * @param operator Join operator
   * @param rightKey Right side of join condition
   * @example .join('posts', 'users.id', '=', 'posts.user_id')
   * @example .join('analytics.events', 'users.id', '=', 'events.user_id')
   */
  join(table: string, leftKey: string, operator: string, rightKey: string): IQueryBuilder<T>;

  /**
   * Add LEFT JOIN clause
   */
  leftJoin(table: string, leftKey: string, operator: string, rightKey: string): IQueryBuilder<T>;

  /**
   * Add RIGHT JOIN clause
   */
  rightJoin(table: string, leftKey: string, operator: string, rightKey: string): IQueryBuilder<T>;

  /**
   * Add GROUP BY clause
   * @param columns Columns to group by
   * @example .groupBy('category', 'status')
   */
  groupBy(...columns: string[]): IQueryBuilder<T>;

  /**
   * Add HAVING clause (used with GROUP BY)
   * @example .having('COUNT(*)', '>', 5)
   */
  having(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T>;

  /**
   * Add ORDER BY clause
   * @param column Column to order by
   * @param direction Sort direction (default: ASC)
   * @example .orderBy('created_at', 'DESC')
   */
  orderBy(column: string, direction?: SortDirection): IQueryBuilder<T>;

  /**
   * Set result limit
   * @param count Maximum number of results
   * @example .limit(10)
   */
  limit(count: number): IQueryBuilder<T>;

  /**
   * Set result offset
   * @param count Number of results to skip
   * @example .offset(20)
   */
  offset(count: number): IQueryBuilder<T>;

  /**
   * Execute query and return all results
   * @returns Promise resolving to array of results
   */
  execute(): Promise<T[]>;

  /**
   * Execute query and return first result
   * @returns Promise resolving to first result or null
   */
  first(): Promise<T | null>;

  /**
   * Execute query and return count of results
   * @param column Optional column to count (default: *)
   * @returns Promise resolving to count
   */
  count(column?: string): Promise<number>;

  /**
   * Check if any results exist
   * @returns Promise resolving to boolean
   */
  exists(): Promise<boolean>;

  /**
   * Get the generated SQL and parameters (for debugging)
   * Does not execute the query
   * @returns Object with sql string and params array
   */
  toSQL(): SqlInfo;

  /**
   * Clone the current query builder
   * Useful for creating query variations
   * @returns New query builder instance with same state
   */
  clone(): IQueryBuilder<T>;
}