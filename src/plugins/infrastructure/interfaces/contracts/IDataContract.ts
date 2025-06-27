import { SqlType, IDeprecation, IContractMetadata } from '../types/ContractTypes';

/**
 * Column definition in a data contract
 */
export interface IColumnContract {
  /** Column name as it appears in the database */
  name: string;

  /** SQL data type */
  type: SqlType;

  /** Whether the column can contain NULL values */
  nullable?: boolean;

  /** Default value expression (e.g., 'CURRENT_TIMESTAMP', '0') */
  defaultValue?: string;

  /** Human-readable description */
  description?: string;

  /** Deprecation information if column is being phased out */
  deprecated?: IDeprecation;

  /** Whether this column is part of the primary key */
  isPrimaryKey?: boolean;

  /** Foreign key reference */
  foreignKey?: {
    table: string;
    column: string;
  };
}

/**
 * Table definition in a data contract
 */
export interface ITableContract {
  /** Table name as it appears in the database */
  name: string;

  /** Column definitions */
  columns: IColumnContract[];

  /** Human-readable description */
  description?: string;

  /** Indexes defined on this table */
  indexes?: IIndexContract[];

  /** Deprecation information if table is being phased out */
  deprecated?: IDeprecation;
}

/**
 * Index definition
 */
export interface IIndexContract {
  /** Index name */
  name: string;

  /** Columns included in the index */
  columns: string[];

  /** Whether this is a unique index */
  unique?: boolean;

  /** Index condition (for partial indexes) */
  where?: string;
}

/**
 * View definition in a data contract
 */
export interface IViewContract {
  /** View name */
  name: string;

  /** SQL query that defines the view */
  query: string;

  /** Column definitions for type safety */
  columns?: IColumnContract[];

  /** Human-readable description */
  description?: string;

  /** Whether this view is materialized */
  materialized?: boolean;
}

/**
 * Main data contract interface
 * Defines the structure of data exposed by a plugin
 */
export interface IDataContract {
  /** Unique contract name (e.g., 'analytics-events') */
  name: string;

  /** Semantic version (e.g., '1.0.0') */
  version: string;

  /** Human-readable description */
  description?: string;

  /** Plugin that owns this contract */
  pluginName: string;

  /** Table definitions */
  tables: ITableContract[];

  /** Custom view definitions */
  views?: IViewContract[];

  /** Contract metadata */
  metadata?: IContractMetadata;

  /** Compatibility constraints */
  compatibility?: {
    /** Minimum compatible version */
    minVersion?: string;

    /** Maximum compatible version */
    maxVersion?: string;

    /** List of breaking versions */
    breakingVersions?: string[];
  };
}