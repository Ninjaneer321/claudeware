/**
 * Claudeware Plugin Infrastructure
 *
 * This module provides the core infrastructure for building Claudeware plugins,
 * including database access, query building, and contract management.
 */

// Core interfaces
export * from './interfaces/core/IPluginDataAccess';
export * from './interfaces/core/IPermissionValidator';
export * from './interfaces/core/IPluginConfig';

// API interfaces
export * from './interfaces/api/IQueryBuilder';
export * from './interfaces/api/IQueryFactory';

// Contract interfaces
export * from './interfaces/contracts/IDataContract';
export * from './interfaces/contracts/IContractEvolution';
export * from './interfaces/contracts/IContractManager';

// Type definitions
export * from './interfaces/types/ContractTypes';

// Error types
export * from './interfaces/errors';

// Core implementations
export { PluginDataAccess } from './core/PluginDataAccess';
export { PermissionValidator } from './core/PermissionValidator';

// API implementations
export { QueryBuilder } from './api/QueryBuilder';
export { QueryFactory } from './api/QueryFactory';

// Contract implementations
export { ContractManager } from './contracts/ContractManager';
export { ViewGenerator } from './contracts/ViewGenerator';
export { ContractValidator } from './contracts/ContractValidator';
export { MigrationEngine } from './contracts/MigrationEngine';