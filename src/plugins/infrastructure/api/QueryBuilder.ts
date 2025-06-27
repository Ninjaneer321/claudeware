import { IQueryBuilder } from '../interfaces/api/IQueryBuilder';
import { IPluginDataAccess } from '../interfaces/core/IPluginDataAccess';
import {
  ComparisonOperator,
  SortDirection,
  SqlInfo,
  QueryState,
  WhereClause
} from '../interfaces/api/types';
import { ValidationError } from '../interfaces/errors';

/**
 * Implementation of IQueryBuilder
 * Provides fluent API for building SQL queries
 */
export class QueryBuilder<T = any> implements IQueryBuilder<T> {
  private state: QueryState = {
    select: [],
    from: null,
    where: [],
    joins: [],
    groupBy: [],
    having: [],
    orderBy: [],
    limit: null,
    offset: null
  };

  private validOperators = new Set<string>([
    '=', '!=', '<', '>', '<=', '>=',
    'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS', 'IS NOT'
  ]);

  constructor(private dataAccess: IPluginDataAccess) {}

  select(...columns: string[]): IQueryBuilder<T> {
    columns.forEach(col => this.validateIdentifier(col));
    this.state.select = columns.length > 0 ? columns : ['*'];
    return this;
  }

  from(table: string, database?: string): IQueryBuilder<T> {
    this.validateIdentifier(table);
    if (database) {
      this.validateIdentifier(database);
    }
    this.state.from = { table, database };
    return this;
  }

  where(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T> {
    this.validateOperator(operator);
    this.state.where.push({ type: 'AND', column, operator, value });
    return this;
  }

  andWhere(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T> {
    return this.where(column, operator, value);
  }

  orWhere(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T> {
    this.validateOperator(operator);
    this.state.where.push({ type: 'OR', column, operator, value });
    return this;
  }

  whereIn(column: string, values: any[]): IQueryBuilder<T> {
    if (values.length === 0) {
      throw new Error('IN clause requires at least one value');
    }
    this.state.where.push({ type: 'AND', column, operator: 'IN', value: values });
    return this;
  }

  whereNotIn(column: string, values: any[]): IQueryBuilder<T> {
    if (values.length === 0) {
      throw new Error('IN clause requires at least one value');
    }
    this.state.where.push({ type: 'AND', column, operator: 'NOT IN', value: values });
    return this;
  }

  whereNull(column: string): IQueryBuilder<T> {
    this.state.where.push({ type: 'AND', column, operator: 'IS', value: null });
    return this;
  }

  whereNotNull(column: string): IQueryBuilder<T> {
    this.state.where.push({ type: 'AND', column, operator: 'IS NOT', value: null });
    return this;
  }

  join(table: string, leftKey: string, operator: string, rightKey: string): IQueryBuilder<T> {
    this.addJoin('INNER', table, leftKey, operator, rightKey);
    return this;
  }

  leftJoin(table: string, leftKey: string, operator: string, rightKey: string): IQueryBuilder<T> {
    this.addJoin('LEFT', table, leftKey, operator, rightKey);
    return this;
  }

  rightJoin(table: string, leftKey: string, operator: string, rightKey: string): IQueryBuilder<T> {
    this.addJoin('RIGHT', table, leftKey, operator, rightKey);
    return this;
  }

  groupBy(...columns: string[]): IQueryBuilder<T> {
    this.state.groupBy.push(...columns);
    return this;
  }

  having(column: string, operator: ComparisonOperator, value: any): IQueryBuilder<T> {
    this.validateOperator(operator);
    this.state.having.push({ type: 'AND', column, operator, value });
    return this;
  }

  orderBy(column: string, direction: SortDirection = 'ASC'): IQueryBuilder<T> {
    this.state.orderBy.push({ column, direction });
    return this;
  }

  limit(count: number): IQueryBuilder<T> {
    if (count < 0) {
      throw new Error('LIMIT must be a positive number');
    }
    this.state.limit = count;
    return this;
  }

  offset(count: number): IQueryBuilder<T> {
    if (count < 0) {
      throw new Error('OFFSET must be a positive number');
    }
    this.state.offset = count;
    return this;
  }

  async execute(): Promise<T[]> {
    const { sql, params } = this.toSQL();
    return this.dataAccess.query<T>(sql, params);
  }

  async first(): Promise<T | null> {
    const results = await this.execute();
    return results[0] || null;
  }

  async count(column: string = '*'): Promise<number> {
    const countQuery = this.clone() as QueryBuilder<T>;
    countQuery.state.select = [`COUNT(${column}) as count`];
    countQuery.state.orderBy = [];
    countQuery.state.limit = null;
    countQuery.state.offset = null;

    const results = await countQuery.execute() as any[];
    return results[0]?.count || 0;
  }

  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  toSQL(): SqlInfo {
    if (!this.state.from) {
      throw new Error('FROM clause is required');
    }

    const parts: string[] = [];
    const params: any[] = [];

    // SELECT
    const selectClause = this.state.select.length > 0
      ? `SELECT ${this.state.select.join(', ')}`
      : 'SELECT *';
    parts.push(selectClause);

    // FROM
    const fromTable = this.state.from.database
      ? `${this.state.from.database}.${this.state.from.table}`
      : this.state.from.table;
    parts.push(`FROM ${fromTable}`);

    // JOINs
    for (const join of this.state.joins) {
      parts.push(`${join.type} JOIN ${join.table} ON ${join.leftKey} ${join.operator} ${join.rightKey}`);
    }

    // WHERE
    if (this.state.where.length > 0) {
      const whereClause = this.buildWhereClause(this.state.where, params);
      parts.push(`WHERE ${whereClause}`);
    }

    // GROUP BY
    if (this.state.groupBy.length > 0) {
      parts.push(`GROUP BY ${this.state.groupBy.join(', ')}`);
    }

    // HAVING
    if (this.state.having.length > 0) {
      const havingClause = this.buildWhereClause(this.state.having, params);
      parts.push(`HAVING ${havingClause}`);
    }

    // ORDER BY
    if (this.state.orderBy.length > 0) {
      const orderClauses = this.state.orderBy
        .map(o => `${o.column} ${o.direction}`)
        .join(', ');
      parts.push(`ORDER BY ${orderClauses}`);
    }

    // LIMIT
    if (this.state.limit !== null) {
      parts.push(`LIMIT ${this.state.limit}`);
    }

    // OFFSET
    if (this.state.offset !== null) {
      parts.push(`OFFSET ${this.state.offset}`);
    }

    return {
      sql: parts.join(' '),
      params
    };
  }

  clone(): IQueryBuilder<T> {
    const cloned = new QueryBuilder<T>(this.dataAccess);
    // Deep clone the state
    cloned.state = {
      select: [...this.state.select],
      from: this.state.from ? { ...this.state.from } : null,
      where: this.state.where.map(w => ({ ...w })),
      joins: this.state.joins.map(j => ({ ...j })),
      groupBy: [...this.state.groupBy],
      having: this.state.having.map(h => ({ ...h })),
      orderBy: this.state.orderBy.map(o => ({ ...o })),
      limit: this.state.limit,
      offset: this.state.offset
    };
    return cloned;
  }

  private buildWhereClause(conditions: WhereClause[], params: any[]): string {
    return conditions.map((condition, index) => {
      let clause = '';

      if (index > 0) {
        clause += ` ${condition.type} `;
      }

      if (condition.operator === 'IS' || condition.operator === 'IS NOT') {
        clause += `${condition.column} ${condition.operator} NULL`;
      } else if (condition.operator === 'IN' || condition.operator === 'NOT IN') {
        const placeholders = condition.value.map(() => '?').join(', ');
        clause += `${condition.column} ${condition.operator} (${placeholders})`;
        params.push(...condition.value);
      } else {
        clause += `${condition.column} ${condition.operator} ?`;
        params.push(condition.value);
      }

      return clause;
    }).join('');
  }

  private addJoin(
    type: 'INNER' | 'LEFT' | 'RIGHT',
    table: string,
    leftKey: string,
    operator: string,
    rightKey: string
  ): void {
    this.state.joins.push({
      type,
      table,
      leftKey,
      operator,
      rightKey
    });
  }

  private validateIdentifier(identifier: string): void {
    // Allow table aliases, column expressions, and aggregates
    // But prevent obvious SQL injection attempts
    if (identifier.includes(';') || identifier.includes('--')) {
      throw new ValidationError(`Invalid identifier: ${identifier}`);
    }
  }

  private validateOperator(operator: string): void {
    if (!this.validOperators.has(operator)) {
      throw new Error(`Invalid operator: ${operator}`);
    }
  }
}