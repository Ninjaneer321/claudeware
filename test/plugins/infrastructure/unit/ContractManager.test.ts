import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContractManager } from '../../contracts/ContractManager';
import { PluginDataAccess } from '../../core/PluginDataAccess';
import { IContractRegistrationOptions, IEvolutionOptions } from '../../interfaces/contracts/IContractManager';
import { IDataContract } from '../../interfaces/contracts/IDataContract';
import { IContractEvolution } from '../../interfaces/contracts/IContractEvolution';
import { ICompatibilityReport } from '../../interfaces/types/ContractTypes';

describe('ContractManager', () => {
  let contractManager: ContractManager;
  let db: Database.Database;
  let dataAccess: PluginDataAccess;
  
  // Sample contracts for testing
  const sampleContractV1: IDataContract = {
    name: 'user-data',
    version: '1.0.0',
    pluginName: 'auth',
    description: 'User authentication data',
    tables: [{
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'email', type: 'TEXT', nullable: false },
        { name: 'name', type: 'TEXT', nullable: true },
        { name: 'created_at', type: 'DATETIME', defaultValue: 'CURRENT_TIMESTAMP' }
      ]
    }]
  };
  
  const sampleContractV2: IDataContract = {
    name: 'user-data',
    version: '2.0.0',
    pluginName: 'auth',
    description: 'User authentication data v2',
    tables: [{
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'email', type: 'TEXT', nullable: false },
        { name: 'name', type: 'TEXT', nullable: true },
        { name: 'username', type: 'TEXT', nullable: false }, // New column
        { name: 'created_at', type: 'DATETIME', defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'DATETIME' } // New column
      ]
    }]
  };
  
  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    dataAccess = new PluginDataAccess(db);
    contractManager = new ContractManager(db, dataAccess);
  });
  
  afterEach(() => {
    // Clean up database
    if (db) {
      db.close();
    }
  });
  
  describe('Contract Registration', () => {
    it('should register a new contract', async () => {
      await expect(contractManager.register(sampleContractV1, { skipViews: true })).resolves.toBeUndefined();
      
      // Verify contract was stored
      const stored = await contractManager.getContract('user-data', '1.0.0');
      expect(stored).toEqual(sampleContractV1);
    });
    
    it('should handle registration options', async () => {
      const options: IContractRegistrationOptions = {
        force: true,
        skipViews: true,
        generateTypes: true,
        typesOutputDir: './types'
      };
      
      await expect(contractManager.register(sampleContractV1, options)).resolves.toBeUndefined();
      
      // Verify contract was stored
      const stored = await contractManager.getContract('user-data', '1.0.0');
      expect(stored).toEqual(sampleContractV1);
    });
    
    it('should reject duplicate contract registration without force', async () => {
      // Register first time
      await contractManager.register(sampleContractV1, { skipViews: true });
      
      // Try to register again without force
      await expect(contractManager.register(sampleContractV1, { skipViews: true }))
        .rejects.toThrow('Contract version user-data@1.0.0 already exists');
    });
  });
  
  describe('Contract Retrieval', () => {
    it('should get a specific contract version', async () => {
      // Register contract first
      await contractManager.register(sampleContractV1, { skipViews: true });
      
      const contract = await contractManager.getContract('user-data', '1.0.0');
      expect(contract).toEqual(sampleContractV1);
    });
    
    it('should get latest contract when version not specified', async () => {
      // Register both versions
      await contractManager.register(sampleContractV1, { skipViews: true });
      await contractManager.register(sampleContractV2, { skipViews: true });
      
      const contract = await contractManager.getContract('user-data');
      expect(contract).toEqual(sampleContractV2);
    });
    
    it('should return null for non-existent contract', async () => {
      const contract = await contractManager.getContract('non-existent', '1.0.0');
      expect(contract).toBeNull();
    });
  });
  
  describe('Contract Listing', () => {
    it('should list all contracts', async () => {
      // Register both contracts
      await contractManager.register(sampleContractV1, { skipViews: true });
      await contractManager.register(sampleContractV2, { skipViews: true });
      
      const contracts = await contractManager.listContracts();
      expect(contracts).toHaveLength(2);
      
      // Sort by version to ensure consistent order
      const sortedContracts = contracts.sort((a, b) => a.version.localeCompare(b.version));
      expect(sortedContracts[0]).toEqual(sampleContractV1);
      expect(sortedContracts[1]).toEqual(sampleContractV2);
    });
    
    it('should filter contracts by plugin name', async () => {
      // Register contracts from different plugins
      await contractManager.register(sampleContractV1, { skipViews: true });
      await contractManager.register({
        ...sampleContractV2,
        pluginName: 'other-plugin'
      }, { skipViews: true });
      
      const contracts = await contractManager.listContracts({ pluginName: 'auth' });
      expect(contracts).toHaveLength(1);
      expect(contracts[0].pluginName).toBe('auth');
    });
    
    it('should filter by version range', async () => {
      // Register multiple versions
      await contractManager.register(sampleContractV1, { skipViews: true });
      await contractManager.register(sampleContractV2, { skipViews: true });
      await contractManager.register({
        ...sampleContractV1,
        version: '1.5.0'
      }, { skipViews: true });
      
      const contracts = await contractManager.listContracts({ 
        minVersion: '1.0.0', 
        maxVersion: '1.5.0' 
      });
      
      expect(contracts).toHaveLength(2);
      expect(contracts.every(c => c.version >= '1.0.0' && c.version <= '1.5.0')).toBe(true);
    });
  });
  
  describe('VIEW Generation', () => {
    it('should generate views for a contract', async () => {
      const views = await contractManager.generateViews(sampleContractV1, { 
        dbAlias: 'auth',
        createLatestAlias: true 
      });
      
      expect(views.length).toBe(2); // Versioned + latest
      expect(views[0]).toContain('CREATE VIEW IF NOT EXISTS users_v1_0_0');
      expect(views[0]).toContain('FROM auth.users');
      expect(views[1]).toContain('CREATE VIEW IF NOT EXISTS users_latest');
    });
    
    it('should handle view generation options', async () => {
      const views = await contractManager.generateViews(sampleContractV1, {
        dbAlias: 'auth',
        viewPrefix: 'contract_',
        includeDeprecated: false,
        createLatestAlias: false
      });
      
      expect(views).toHaveLength(1); // Only versioned view, no latest alias
      expect(views[0]).toContain('users_v1_0_0'); // Should still use standard naming
    });
    
    it('should generate views with deprecated columns marked', async () => {
      const contractWithDeprecated: IDataContract = {
        ...sampleContractV1,
        tables: [{
          ...sampleContractV1.tables[0],
          columns: [
            ...sampleContractV1.tables[0].columns,
            { 
              name: 'old_field', 
              type: 'TEXT', 
              deprecated: { 
                since: '1.1.0', 
                alternative: 'new_field' 
              } 
            }
          ]
        }]
      };
      
      const views = await contractManager.generateViews(contractWithDeprecated, { dbAlias: 'auth' });
      expect(views[0]).toContain('old_field -- DEPRECATED since 1.1.0, use new_field instead');
    });
  });
  
  describe('Compatibility Validation', () => {
    it('should validate compatible changes', () => {
      const result = contractManager.validateCompatibility(sampleContractV1, sampleContractV2);
      
      // Adding new columns is not breaking
      expect(result.compatible).toBe(true);
      expect(result.hasBreakingChanges).toBe(false);
      expect(result.issues.some(i => i.type === 'COLUMN_ADDED')).toBe(true);
    });
    
    it('should detect breaking changes', () => {
      const breakingContract: IDataContract = {
        ...sampleContractV2,
        tables: [{
          ...sampleContractV2.tables[0],
          columns: sampleContractV2.tables[0].columns.filter(c => c.name !== 'email') // Removed column
        }]
      };
      
      const result = contractManager.validateCompatibility(sampleContractV1, breakingContract);
      expect(result.compatible).toBe(false);
      expect(result.hasBreakingChanges).toBe(true);
      
      const breakingIssue = result.issues.find(i => i.severity === 'BREAKING' && i.column === 'email');
      expect(breakingIssue).toBeDefined();
      expect(breakingIssue?.message).toContain('was removed without deprecation');
    });
    
    it('should allow deprecated column removal', () => {
      const deprecatedContract: IDataContract = {
        ...sampleContractV1,
        tables: [{
          ...sampleContractV1.tables[0],
          columns: [
            ...sampleContractV1.tables[0].columns,
            { 
              name: 'to_remove', 
              type: 'TEXT',
              deprecated: { since: '0.9.0' }
            }
          ]
        }]
      };
      
      const result = contractManager.validateCompatibility(deprecatedContract, sampleContractV1);
      expect(result.compatible).toBe(true);
      
      const removalIssue = result.issues.find(i => i.column === 'to_remove');
      expect(removalIssue?.severity).toBe('INFO');
      expect(removalIssue?.type).toBe('DEPRECATED_COLUMN_REMOVED');
    });
  });
  
  describe('Contract Evolution', () => {
    it.skip('should execute evolution successfully', async () => {
      // TODO: Implement when we have a test database with actual tables
    });
    
    it.skip('should handle evolution with rollback', async () => {
      // TODO: Implement when we have a test database with actual tables
    });
    
    it.skip('should support dry run mode', async () => {
      // TODO: Implement when we have a test database with actual tables
    });
  });
  
  describe('Evolution Path', () => {
    it('should return empty path for same version', async () => {
      const path = await contractManager.getEvolutionPath('user-data', '1.0.0', '1.0.0');
      expect(path).toHaveLength(0);
    });
    
    it('should throw for unimplemented evolution path finding', async () => {
      // This feature is not yet implemented
      await expect(contractManager.getEvolutionPath('user-data', '1.0.0', '2.0.0'))
        .rejects.toThrow('Evolution path finding not yet implemented');
    });
  });
  
  describe('Import/Export', () => {
    it('should export contract as JSON', async () => {
      // Register contract first
      await contractManager.register(sampleContractV1, { skipViews: true });
      
      const json = await contractManager.exportContract('user-data', '1.0.0');
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(sampleContractV1);
    });
    
    it('should import contract from JSON', async () => {
      const json = JSON.stringify(sampleContractV1);
      
      await contractManager.importContract(json, { skipViews: true });
      
      // Verify it was imported
      const imported = await contractManager.getContract('user-data', '1.0.0');
      expect(imported).toEqual(sampleContractV1);
    });
  });
  
  describe('View Management', () => {
    it('should drop views for a contract', async () => {
      // Register contract first
      await contractManager.register(sampleContractV1, { skipViews: true });
      
      // Create the views manually
      const createViewSql = 'CREATE VIEW users_v1_0_0 AS SELECT * FROM users';
      try {
        db.exec(createViewSql);
      } catch (e) {
        // View might not exist, that's ok
      }
      
      // Drop views
      await expect(contractManager.dropViews('user-data', '1.0.0')).resolves.toBeUndefined();
    });
    
    it('should throw when dropping views for non-existent contract', async () => {
      await expect(contractManager.dropViews('non-existent', '1.0.0'))
        .rejects.toThrow('Contract non-existent@1.0.0 not found');
    });
  });
});