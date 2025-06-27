/**
 * Common types for the Query Builder API
 */

export type ComparisonOperator =
  | '='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | 'LIKE'
  | 'NOT LIKE'
  | 'IN'
  | 'NOT IN'
  | 'IS'
  | 'IS NOT';

export type SortDirection = 'ASC' | 'DESC';

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

export interface SqlInfo {
  sql: string;
  params: any[];
}

export interface WhereClause {
  type: 'AND' | 'OR';
  column: string;
  operator: ComparisonOperator;
  value: any;
}

export interface JoinClause {
  type: JoinType;
  table: string;
  leftKey: string;
  operator: string;
  rightKey: string;
}

export interface OrderByClause {
  column: string;
  direction: SortDirection;
}

export interface QueryState {
  select: string[];
  from: { table: string; database?: string } | null;
  where: WhereClause[];
  joins: JoinClause[];
  groupBy: string[];
  having: WhereClause[];
  orderBy: OrderByClause[];
  limit: number | null;
  offset: number | null;
}