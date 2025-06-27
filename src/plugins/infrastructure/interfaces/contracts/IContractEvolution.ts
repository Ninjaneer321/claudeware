import { ISchemaChange } from '../types/ContractTypes';

/**
 * Migration step in a contract evolution
 */
export interface IMigrationStep {
  /** Step description */
  description: string;

  /** SQL to execute */
  sql?: string;

  /** Custom migration function */
  handler?: (context: IMigrationContext) => Promise<void>;

  /** Whether this step can be rolled back */
  reversible?: boolean;

  /** SQL or handler for rollback */
  rollback?: string | ((context: IMigrationContext) => Promise<void>);
}

/**
 * Context provided to migration handlers
 */
export interface IMigrationContext {
  /** Database connection */
  query: (sql: string, params?: any[]) => Promise<any[]>;

  /** Current contract version */
  fromVersion: string;

  /** Target contract version */
  toVersion: string;

  /** Plugin name */
  pluginName: string;

  /** Logger for migration output */
  log: (message: string) => void;
}

/**
 * Contract evolution definition
 * Describes how to migrate from one contract version to another
 */
export interface IContractEvolution {
  /** Source contract version */
  fromVersion: string;

  /** Target contract version */
  toVersion: string;

  /** Human-readable description of changes */
  description: string;

  /** List of schema changes */
  changes: ISchemaChange[];

  /** Migration steps to execute */
  migrations: IMigrationStep[];

  /** Estimated migration duration in seconds */
  estimatedDuration?: number;

  /** Whether this migration requires downtime */
  requiresDowntime?: boolean;

  /** Pre-migration validation */
  preCheck?: (context: IMigrationContext) => Promise<boolean>;

  /** Post-migration validation */
  postCheck?: (context: IMigrationContext) => Promise<boolean>;
}