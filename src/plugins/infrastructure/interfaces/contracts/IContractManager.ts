import { IDataContract } from './IDataContract';
import { IContractEvolution } from './IContractEvolution';
import { ICompatibilityReport } from '../types/ContractTypes';

/**
 * Contract registration options
 */
export interface IContractRegistrationOptions {
  /** Force registration even if version exists */
  force?: boolean;

  /** Skip view generation */
  skipViews?: boolean;

  /** Generate TypeScript types */
  generateTypes?: boolean;

  /** Output directory for generated types */
  typesOutputDir?: string;
}

/**
 * Contract query options
 */
export interface IContractQueryOptions {
  /** Include deprecated contracts */
  includeDeprecated?: boolean;

  /** Filter by plugin name */
  pluginName?: string;

  /** Minimum version to include */
  minVersion?: string;

  /** Maximum version to include */
  maxVersion?: string;
}

/**
 * View generation options
 */
export interface IViewGenerationOptions {
  /** Database alias for the plugin */
  dbAlias: string;

  /** Prefix for generated view names */
  viewPrefix?: string;

  /** Include deprecated columns */
  includeDeprecated?: boolean;

  /** Create 'latest' alias views */
  createLatestAlias?: boolean;
}

/**
 * Contract Manager interface
 * Manages data contracts, schema evolution, and VIEW generation
 */
export interface IContractManager {
  /**
   * Register a new data contract
   */
  register(contract: IDataContract, options?: IContractRegistrationOptions): Promise<void>;

  /**
   * Retrieve a specific contract
   */
  getContract(name: string, version?: string): Promise<IDataContract | null>;

  /**
   * List all contracts matching criteria
   */
  listContracts(options?: IContractQueryOptions): Promise<IDataContract[]>;

  /**
   * Generate SQL VIEWs for a contract
   */
  generateViews(contract: IDataContract, options: IViewGenerationOptions): Promise<string[]>;

  /**
   * Validate compatibility between two contract versions
   */
  validateCompatibility(
    oldContract: IDataContract,
    newContract: IDataContract
  ): ICompatibilityReport;

  /**
   * Execute a contract evolution (migration)
   */
  evolve(
    contract: IDataContract,
    evolution: IContractEvolution,
    options?: IEvolutionOptions
  ): Promise<IEvolutionResult>;

  /**
   * Get evolution path between two versions
   */
  getEvolutionPath(
    contractName: string,
    fromVersion: string,
    toVersion: string
  ): Promise<IContractEvolution[]>;

  /**
   * Drop all views for a contract
   */
  dropViews(contractName: string, version: string): Promise<void>;

  /**
   * Export contract as JSON
   */
  exportContract(name: string, version: string): Promise<string>;

  /**
   * Import contract from JSON
   */
  importContract(json: string, options?: IContractRegistrationOptions): Promise<void>;
}

/**
 * Evolution execution options
 */
export interface IEvolutionOptions {
  /** Dry run - show what would be done without executing */
  dryRun?: boolean;

  /** Create backup before migration */
  backup?: boolean;

  /** Transaction mode */
  transactional?: boolean;

  /** Progress callback */
  onProgress?: (step: number, total: number, description: string) => void;
}

/**
 * Evolution execution result
 */
export interface IEvolutionResult {
  /** Whether evolution succeeded */
  success: boolean;

  /** Steps executed */
  executedSteps: number;

  /** Total steps */
  totalSteps: number;

  /** Execution duration in milliseconds */
  duration: number;

  /** Error if failed */
  error?: Error;

  /** Rollback performed */
  rolledBack?: boolean;

  /** Migration log */
  log: string[];
}