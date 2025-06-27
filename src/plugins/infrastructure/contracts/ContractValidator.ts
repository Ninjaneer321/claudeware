import { IDataContract, ITableContract, IColumnContract } from '../interfaces/contracts/IDataContract';
import { ICompatibilityReport, ICompatibilityIssue, SqlType } from '../interfaces/types/ContractTypes';

/**
 * Validates data contracts and checks compatibility between versions
 */
export class ContractValidator {
  private validSqlTypes: Set<string> = new Set([
    'TEXT', 'INTEGER', 'REAL', 'BLOB', 'BOOLEAN', 'DATETIME', 'JSON'
  ]);

  /**
   * Validate a data contract structure
   */
  validateContract(contract: IDataContract): string[] {
    const errors: string[] = [];

    // Basic validation
    if (!contract.name || contract.name.trim() === '') {
      errors.push('Contract name is required');
    }

    if (!contract.version || contract.version.trim() === '') {
      errors.push('Contract version is required');
    }

    if (!this.isValidSemver(contract.version)) {
      errors.push(`Invalid version format: ${contract.version}`);
    }

    if (!contract.pluginName || contract.pluginName.trim() === '') {
      errors.push('Plugin name is required');
    }

    if (!contract.tables || contract.tables.length === 0) {
      errors.push('Contract must have at least one table');
    }

    // Validate tables
    contract.tables?.forEach((table, tableIndex) => {
      const tableErrors = this.validateTable(table, `tables[${tableIndex}]`);
      errors.push(...tableErrors);
    });

    // Validate custom views if present
    contract.views?.forEach((view, viewIndex) => {
      if (!view.name || view.name.trim() === '') {
        errors.push(`View at views[${viewIndex}] must have a name`);
      }
      if (!view.query || view.query.trim() === '') {
        errors.push(`View at views[${viewIndex}] must have a query`);
      }
    });

    return errors;
  }

  /**
   * Validate a table definition
   */
  private validateTable(table: ITableContract, path: string): string[] {
    const errors: string[] = [];

    if (!table.name || table.name.trim() === '') {
      errors.push(`Table at ${path} must have a name`);
    }

    if (!table.columns || table.columns.length === 0) {
      errors.push(`Table ${table.name || path} must have at least one column`);
    }

    // Check for primary key
    const primaryKeys = table.columns?.filter(col => col.isPrimaryKey) || [];
    if (primaryKeys.length === 0) {
      // Warning, not error - tables can exist without primary keys
    }

    // Validate columns
    table.columns?.forEach((column, colIndex) => {
      const colErrors = this.validateColumn(column, `${path}.columns[${colIndex}]`);
      errors.push(...colErrors);
    });

    // Validate indexes
    table.indexes?.forEach((index, indexIndex) => {
      if (!index.name) {
        errors.push(`Index at ${path}.indexes[${indexIndex}] must have a name`);
      }
      if (!index.columns || index.columns.length === 0) {
        errors.push(`Index ${index.name || indexIndex} must have at least one column`);
      }
    });

    return errors;
  }

  /**
   * Validate a column definition
   */
  private validateColumn(column: IColumnContract, path: string): string[] {
    const errors: string[] = [];

    if (!column.name || column.name.trim() === '') {
      errors.push(`Column at ${path} must have a name`);
    }

    if (!column.type) {
      errors.push(`Column ${column.name || path} must have a type`);
    } else if (!this.validateColumnType(column.type)) {
      errors.push(`Invalid column type "${column.type}" for ${column.name || path}`);
    }

    // Primary keys should not be nullable
    if (column.isPrimaryKey && column.nullable === true) {
      errors.push(`Primary key column ${column.name || path} cannot be nullable`);
    }

    // Validate deprecation
    if (column.deprecated) {
      if (!column.deprecated.since) {
        errors.push(`Deprecated column ${column.name || path} must specify "since" version`);
      }
    }

    return errors;
  }

  /**
   * Check if column type is valid
   */
  validateColumnType(type: string): boolean {
    return this.validSqlTypes.has(type as SqlType);
  }

  /**
   * Compare two contracts for compatibility
   */
  compareContracts(oldContract: IDataContract, newContract: IDataContract): ICompatibilityReport {
    const issues: ICompatibilityIssue[] = [];
    let hasBreakingChanges = false;

    // Check contract name change
    if (oldContract.name !== newContract.name) {
      issues.push({
        severity: 'BREAKING',
        type: 'CONTRACT_NAME_CHANGED',
        message: `Contract name changed from "${oldContract.name}" to "${newContract.name}"`
      });
      hasBreakingChanges = true;
    }

    // Check each old table
    oldContract.tables.forEach(oldTable => {
      const newTable = newContract.tables.find(t => t.name === oldTable.name);

      if (!newTable) {
        if (!oldTable.deprecated) {
          issues.push({
            severity: 'BREAKING',
            type: 'TABLE_REMOVED',
            message: `Table "${oldTable.name}" was removed without deprecation`,
            table: oldTable.name
          });
          hasBreakingChanges = true;
        } else {
          issues.push({
            severity: 'INFO',
            type: 'DEPRECATED_TABLE_REMOVED',
            message: `Deprecated table "${oldTable.name}" was removed`,
            table: oldTable.name
          });
        }
      } else {
        // Check columns
        const tableIssues = this.compareTableColumns(oldTable, newTable);
        issues.push(...tableIssues.issues);
        if (tableIssues.hasBreaking) {
          hasBreakingChanges = true;
        }
      }
    });

    // Check for new tables (not breaking)
    newContract.tables.forEach(newTable => {
      const oldTable = oldContract.tables.find(t => t.name === newTable.name);
      if (!oldTable) {
        issues.push({
          severity: 'INFO',
          type: 'TABLE_ADDED',
          message: `New table "${newTable.name}" added`,
          table: newTable.name
        });
      }
    });

    return {
      compatible: !hasBreakingChanges,
      hasBreakingChanges,
      issues,
      summary: this.generateSummary(issues, hasBreakingChanges)
    };
  }

  /**
   * Compare columns between two table versions
   */
  private compareTableColumns(
    oldTable: ITableContract,
    newTable: ITableContract
  ): { issues: ICompatibilityIssue[], hasBreaking: boolean } {
    const issues: ICompatibilityIssue[] = [];
    let hasBreaking = false;

    // Check each old column
    oldTable.columns.forEach(oldCol => {
      const newCol = newTable.columns.find(c => c.name === oldCol.name);

      if (this.isBreakingChange(oldCol, newCol)) {
        const changeType = this.getBreakingChangeType(oldCol, newCol);
        issues.push({
          severity: 'BREAKING',
          type: changeType,
          message: this.getBreakingChangeMessage(changeType, oldCol, newCol),
          table: oldTable.name,
          column: oldCol.name
        });
        hasBreaking = true;
      } else if (!newCol && oldCol.deprecated) {
        issues.push({
          severity: 'INFO',
          type: 'DEPRECATED_COLUMN_REMOVED',
          message: `Deprecated column "${oldCol.name}" was removed`,
          table: oldTable.name,
          column: oldCol.name
        });
      }
    });

    // Check for new columns
    newTable.columns.forEach(newCol => {
      const oldCol = oldTable.columns.find(c => c.name === newCol.name);

      if (!oldCol) {
        if (newCol.nullable === false && !newCol.defaultValue) {
          issues.push({
            severity: 'WARNING',
            type: 'REQUIRED_COLUMN_ADDED',
            message: `New required column "${newCol.name}" without default value`,
            table: newTable.name,
            column: newCol.name,
            suggestion: 'Consider adding a default value or migration script'
          });
        } else {
          issues.push({
            severity: 'INFO',
            type: 'COLUMN_ADDED',
            message: `New column "${newCol.name}" added`,
            table: newTable.name,
            column: newCol.name
          });
        }
      }
    });

    return { issues, hasBreaking };
  }

  /**
   * Check if a column change is breaking
   */
  isBreakingChange(oldCol?: IColumnContract, newCol?: IColumnContract): boolean {
    // Column removed without deprecation
    if (oldCol && !newCol && !oldCol.deprecated) {
      return true;
    }

    if (oldCol && newCol) {
      // Type changed
      if (oldCol.type !== newCol.type) {
        return true;
      }

      // Nullable changed from true to false
      if (oldCol.nullable === true && newCol.nullable === false) {
        return true;
      }

      // Primary key status changed
      if (oldCol.isPrimaryKey !== newCol.isPrimaryKey) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the type of breaking change
   */
  private getBreakingChangeType(oldCol: IColumnContract, newCol?: IColumnContract): string {
    if (!newCol) return 'COLUMN_REMOVED';
    if (oldCol.type !== newCol.type) return 'COLUMN_TYPE_CHANGED';
    if (oldCol.nullable === true && newCol.nullable === false) return 'COLUMN_NULLABLE_CHANGED';
    if (oldCol.isPrimaryKey !== newCol.isPrimaryKey) return 'COLUMN_PRIMARY_KEY_CHANGED';
    return 'COLUMN_BREAKING_CHANGE';
  }

  /**
   * Get breaking change message
   */
  private getBreakingChangeMessage(
    changeType: string,
    oldCol: IColumnContract,
    newCol?: IColumnContract
  ): string {
    switch (changeType) {
      case 'COLUMN_REMOVED':
        return `Column "${oldCol.name}" was removed without deprecation`;
      case 'COLUMN_TYPE_CHANGED':
        return `Column "${oldCol.name}" type changed from ${oldCol.type} to ${newCol?.type}`;
      case 'COLUMN_NULLABLE_CHANGED':
        return `Column "${oldCol.name}" changed from nullable to non-nullable`;
      case 'COLUMN_PRIMARY_KEY_CHANGED':
        return `Column "${oldCol.name}" primary key status changed`;
      default:
        return `Breaking change in column "${oldCol.name}"`;
    }
  }

  /**
   * Generate compatibility summary
   */
  private generateSummary(issues: ICompatibilityIssue[], hasBreakingChanges: boolean): string {
    const breakingCount = issues.filter(i => i.severity === 'BREAKING').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;
    const infoCount = issues.filter(i => i.severity === 'INFO').length;

    if (hasBreakingChanges) {
      return `${breakingCount} breaking change${breakingCount !== 1 ? 's' : ''} detected`;
    }

    if (issues.length === 0) {
      return 'No changes detected';
    }

    const parts: string[] = [];
    if (warningCount > 0) {
      parts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`);
    }
    if (infoCount > 0) {
      parts.push(`${infoCount} info message${infoCount !== 1 ? 's' : ''}`);
    }

    return `Compatible changes with ${parts.join(' and ')}`;
  }

  /**
   * Check if version string is valid semver
   */
  private isValidSemver(version: string): boolean {
    // Simple semver validation
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    return semverRegex.test(version);
  }
}