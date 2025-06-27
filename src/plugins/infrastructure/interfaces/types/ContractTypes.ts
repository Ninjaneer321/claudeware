/**
 * Type definitions for the Contract Layer
 */

/**
 * SQL data types supported in contracts
 */
export type SqlType =
  | 'TEXT'
  | 'INTEGER'
  | 'REAL'
  | 'BLOB'
  | 'BOOLEAN'
  | 'DATETIME'
  | 'JSON';

/**
 * Severity levels for compatibility issues
 */
export type CompatibilitySeverity = 'BREAKING' | 'WARNING' | 'INFO';

/**
 * Types of schema changes
 */
export type SchemaChangeType =
  | 'ADD_TABLE'
  | 'REMOVE_TABLE'
  | 'ADD_COLUMN'
  | 'REMOVE_COLUMN'
  | 'MODIFY_COLUMN'
  | 'RENAME_TABLE'
  | 'RENAME_COLUMN';

/**
 * Deprecation information
 */
export interface IDeprecation {
  since: string;
  alternative?: string;
  removalDate?: string;
  reason?: string;
}

/**
 * Schema change definition
 */
export interface ISchemaChange {
  type: SchemaChangeType;
  table: string;
  column?: string;
  oldValue?: any;
  newValue?: any;
  description?: string;
}

/**
 * Compatibility issue report
 */
export interface ICompatibilityIssue {
  severity: CompatibilitySeverity;
  type: string;
  message: string;
  table?: string;
  column?: string;
  suggestion?: string;
}

/**
 * Full compatibility report
 */
export interface ICompatibilityReport {
  compatible: boolean;
  issues: ICompatibilityIssue[];
  hasBreakingChanges: boolean;
  summary: string;
}

/**
 * Contract metadata
 */
export interface IContractMetadata {
  author?: string;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  documentation?: string;
}