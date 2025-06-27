import type { Database } from 'better-sqlite3';
import { IContractManager, IContractRegistrationOptions, IContractQueryOptions, IViewGenerationOptions, IEvolutionOptions, IEvolutionResult } from '../interfaces/contracts/IContractManager';
import { IDataContract } from '../interfaces/contracts/IDataContract';
import { IContractEvolution, IMigrationContext } from '../interfaces/contracts/IContractEvolution';
import { ICompatibilityReport } from '../interfaces/types/ContractTypes';
import { ViewGenerator } from './ViewGenerator';
import { ContractValidator } from './ContractValidator';
import { MigrationEngine } from './MigrationEngine';
import { IPluginDataAccess } from '../interfaces/core/IPluginDataAccess';

/**
 * Manages data contracts, schema evolution, and VIEW generation
 */
export class ContractManager implements IContractManager {
  private db: Database;
  private dataAccess: IPluginDataAccess;
  private viewGenerator: ViewGenerator;
  private validator: ContractValidator;
  private migrationEngine: MigrationEngine;
  private contractTableCreated = false;

  constructor(db: Database, dataAccess: IPluginDataAccess) {
    this.db = db;
    this.dataAccess = dataAccess;
    this.viewGenerator = new ViewGenerator();
    this.validator = new ContractValidator();
    this.migrationEngine = new MigrationEngine(db);

    this.ensureContractTable();
  }

  /**
   * Ensure the contracts table exists
   */
  private ensureContractTable(): void {
    if (this.contractTableCreated) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _contracts (
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        contract_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deprecated_at TEXT,
        PRIMARY KEY (name, version)
      );
      
      CREATE INDEX IF NOT EXISTS idx_contracts_active 
      ON _contracts(name, deprecated_at);
    `);

    this.contractTableCreated = true;
  }

  async register(contract: IDataContract, options?: IContractRegistrationOptions): Promise<void> {
    // Validate contract structure
    const errors = this.validator.validateContract(contract);
    if (errors.length > 0) {
      throw new Error(`Invalid contract: ${errors.join(', ')}`);
    }

    // Check if version already exists
    const existing = await this.getContract(contract.name, contract.version);
    if (existing && !options?.force) {
      throw new Error(`Contract version ${contract.name}@${contract.version} already exists`);
    }

    // Store contract
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO _contracts (name, version, contract_json)
      VALUES (?, ?, ?)
    `);

    stmt.run(
      contract.name,
      contract.version,
      JSON.stringify(contract)
    );

    // Generate views unless skipped
    if (!options?.skipViews) {
      const views = await this.generateViews(contract, {
        dbAlias: 'main', // Use 'main' for the default database
        createLatestAlias: true
      });

      // Execute view creation
      for (const viewSql of views) {
        this.db.exec(viewSql);
      }
    }

    // Generate TypeScript types if requested
    if (options?.generateTypes && options.typesOutputDir) {
      // This would be implemented to generate .d.ts files
      // For now, we'll skip this feature
    }
  }

  async getContract(name: string, version?: string): Promise<IDataContract | null> {
    let query: string;
    let params: any[];

    if (version) {
      // Get specific version
      query = 'SELECT contract_json FROM _contracts WHERE name = ? AND version = ?';
      params = [name, version];
    } else {
      // Get latest non-deprecated version
      query = `
        SELECT contract_json 
        FROM _contracts 
        WHERE name = ? AND deprecated_at IS NULL
        ORDER BY version DESC
        LIMIT 1
      `;
      params = [name];
    }

    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as { contract_json: string } | undefined;

    if (!row) return null;

    return JSON.parse(row.contract_json);
  }

  async listContracts(options?: IContractQueryOptions): Promise<IDataContract[]> {
    let query = 'SELECT contract_json FROM _contracts WHERE 1=1';
    const params: any[] = [];

    // Apply filters
    if (!options?.includeDeprecated) {
      query += ' AND deprecated_at IS NULL';
    }

    if (options?.pluginName) {
      query += ' AND json_extract(contract_json, \'$.pluginName\') = ?';
      params.push(options.pluginName);
    }

    if (options?.minVersion) {
      query += ' AND version >= ?';
      params.push(options.minVersion);
    }

    if (options?.maxVersion) {
      query += ' AND version <= ?';
      params.push(options.maxVersion);
    }

    query += ' ORDER BY name, version DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as { contract_json: string }[];

    return rows.map(row => JSON.parse(row.contract_json));
  }

  async generateViews(contract: IDataContract, options: IViewGenerationOptions): Promise<string[]> {
    const views: string[] = [];

    // Generate views for each table
    for (const table of contract.tables) {
      // Generate versioned view
      const viewSql = this.viewGenerator.generateTableView(
        table,
        contract,
        options.dbAlias,
        {
          viewPrefix: options.viewPrefix,
          includeDeprecated: options.includeDeprecated ?? true
        }
      );
      views.push(viewSql);

      // Generate latest alias if requested
      if (options.createLatestAlias) {
        const latestSql = this.viewGenerator.generateLatestView(
          table,
          contract,
          options.dbAlias
        );
        views.push(latestSql);
      }
    }

    // Generate custom views if defined
    if (contract.views) {
      for (const view of contract.views) {
        const customViewSql = this.viewGenerator.generateCustomView(
          view,
          contract,
          options.dbAlias
        );
        views.push(customViewSql);
      }
    }

    return views;
  }

  validateCompatibility(oldContract: IDataContract, newContract: IDataContract): ICompatibilityReport {
    return this.validator.compareContracts(oldContract, newContract);
  }

  async evolve(
    contract: IDataContract,
    evolution: IContractEvolution,
    options?: IEvolutionOptions
  ): Promise<IEvolutionResult> {
    const startTime = Date.now();
    const log: string[] = [];

    // Create migration context
    const context: IMigrationContext = {
      query: async (sql: string, params?: any[]) => {
        return this.dataAccess.query(sql, params);
      },
      fromVersion: evolution.fromVersion,
      toVersion: evolution.toVersion,
      pluginName: contract.pluginName,
      log: (message: string) => log.push(message)
    };

    // Run evolution
    const result = await this.migrationEngine.execute(
      evolution,
      context,
      options
    );

    // If successful, register new contract version
    if (result.success && !options?.dryRun) {
      await this.register(contract, { skipViews: false });
    }

    return {
      ...result,
      duration: Date.now() - startTime,
      log
    };
  }

  async getEvolutionPath(
    _contractName: string,
    fromVersion: string,
    toVersion: string
  ): Promise<IContractEvolution[]> {
    // In a real implementation, this would query stored evolutions
    // For now, return empty array if versions match
    if (fromVersion === toVersion) {
      return [];
    }

    // This would normally query a table of stored evolutions
    // and build a path from fromVersion to toVersion
    throw new Error('Evolution path finding not yet implemented');
  }

  async dropViews(contractName: string, version: string): Promise<void> {
    const contract = await this.getContract(contractName, version);
    if (!contract) {
      throw new Error(`Contract ${contractName}@${version} not found`);
    }

    // Drop all views for this contract version
    for (const table of contract.tables) {
      const viewName = this.viewGenerator.generateViewName(table.name, version);
      const latestViewName = this.viewGenerator.generateViewName(table.name, version, true);

      try {
        this.db.exec(`DROP VIEW IF EXISTS ${viewName}`);
        this.db.exec(`DROP VIEW IF EXISTS ${latestViewName}`);
      } catch (error) {
        // Continue even if some views don't exist
      }
    }
  }

  async exportContract(name: string, version: string): Promise<string> {
    const contract = await this.getContract(name, version);
    if (!contract) {
      throw new Error(`Contract ${name}@${version} not found`);
    }

    return JSON.stringify(contract, null, 2);
  }

  async importContract(json: string, options?: IContractRegistrationOptions): Promise<void> {
    let contract: IDataContract;

    try {
      contract = JSON.parse(json);
    } catch (error) {
      throw new Error('Invalid JSON format');
    }

    await this.register(contract, options);
  }
}