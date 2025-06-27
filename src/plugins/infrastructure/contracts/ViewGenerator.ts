import { IDataContract, ITableContract, IViewContract } from '../interfaces/contracts/IDataContract';

/**
 * Options for view generation
 */
export interface IViewGenerationConfig {
  viewPrefix?: string;
  includeDeprecated?: boolean;
}

/**
 * Generates SQL VIEWs from data contracts
 */
export class ViewGenerator {
  /**
   * Generate view name based on table name and version
   */
  generateViewName(tableName: string, version: string, isLatest?: boolean): string {
    if (isLatest) {
      return `${tableName}_latest`;
    }

    // Replace dots and special characters with underscores
    const sanitizedVersion = version.replace(/[.-]/g, '_');
    return `${tableName}_v${sanitizedVersion}`;
  }

  /**
   * Format column list for SELECT statement
   */
  formatColumnList(table: ITableContract, includeDeprecated: boolean): string[] {
    return table.columns
      .filter(col => includeDeprecated || !col.deprecated)
      .map(col => {
        let columnDef = this.escapeIdentifier(col.name);

        // Add deprecation comment
        if (col.deprecated) {
          columnDef += ` -- DEPRECATED since ${col.deprecated.since}`;
          if (col.deprecated.alternative) {
            columnDef += `, use ${col.deprecated.alternative} instead`;
          }
        }

        return columnDef;
      });
  }

  /**
   * Generate SQL for a table view
   */
  generateTableView(
    table: ITableContract,
    contract: IDataContract,
    dbAlias: string,
    config?: IViewGenerationConfig
  ): string {
    const viewName = this.generateViewName(table.name, contract.version);
    const columns = this.formatColumnList(table, config?.includeDeprecated ?? true);

    // Build view SQL
    const sql = [
      `CREATE VIEW IF NOT EXISTS ${this.escapeIdentifier(viewName)} AS`,
      'SELECT',
      columns.map(col => `       ${col}`).join(',\n'),
      `FROM ${this.escapeIdentifier(dbAlias)}.${this.escapeIdentifier(table.name)}`
    ];

    // Add table comment if available
    if (table.description || table.deprecated) {
      sql.unshift('-- ' + (table.description || ''));
      if (table.deprecated) {
        sql.unshift(`-- DEPRECATED since ${table.deprecated.since}`);
      }
    }

    return sql.join('\n');
  }

  /**
   * Generate SQL for latest view alias
   */
  generateLatestView(
    table: ITableContract,
    contract: IDataContract,
    _dbAlias: string
  ): string {
    const latestViewName = this.generateViewName(table.name, contract.version, true);
    const versionedViewName = this.generateViewName(table.name, contract.version);

    return [
      `-- Latest view alias for ${table.name}`,
      `CREATE VIEW IF NOT EXISTS ${this.escapeIdentifier(latestViewName)} AS`,
      `SELECT * FROM ${this.escapeIdentifier(versionedViewName)}`
    ].join('\n');
  }

  /**
   * Generate SQL for custom view
   */
  generateCustomView(
    view: IViewContract,
    contract: IDataContract,
    dbAlias: string
  ): string {
    const viewName = `${view.name}_v${contract.version.replace(/\./g, '_')}`;

    // Replace database references in the query
    let query = view.query;

    // Simple replacement of {db} placeholder with actual alias
    query = query.replace(/\{db\}/g, this.escapeIdentifier(dbAlias));

    const sql = [
      `CREATE VIEW IF NOT EXISTS ${this.escapeIdentifier(viewName)} AS`,
      query
    ];

    if (view.description) {
      sql.unshift('-- ' + view.description);
    }

    return sql.join('\n');
  }

  /**
   * Escape SQLite identifier (table/column names)
   */
  private escapeIdentifier(identifier: string): string {
    // SQLite uses double quotes for identifiers
    // But only if they contain special characters or are keywords
    const needsQuoting = /[^a-zA-Z0-9_]/.test(identifier) || this.isSqlKeyword(identifier);

    if (needsQuoting) {
      // Escape any existing quotes
      return `"${identifier.replace(/"/g, '""')}"`;
    }

    return identifier;
  }

  /**
   * Check if identifier is a SQL keyword
   */
  private isSqlKeyword(word: string): boolean {
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'ORDER', 'GROUP', 'BY',
      'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
      'TABLE', 'VIEW', 'INDEX', 'JOIN', 'LEFT', 'RIGHT',
      'INNER', 'OUTER', 'ON', 'AS', 'AND', 'OR', 'NOT',
      'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
      'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT'
    ];

    return keywords.includes(word.toUpperCase());
  }
}