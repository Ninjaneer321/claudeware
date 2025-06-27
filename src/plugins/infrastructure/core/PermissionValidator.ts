import * as path from 'path';
import { IPermissionValidator } from '../interfaces/core/IPermissionValidator';
import { IPluginDataAccess } from '../interfaces/core/IPluginDataAccess';
import { IPluginConfig } from '../interfaces/core/IPluginConfig';
import { SecurityError, PermissionError } from '../interfaces/errors';

/**
 * Implementation of IPermissionValidator
 * Validates plugin permissions based on package.json configuration
 */
export class PermissionValidator implements IPermissionValidator {
  private permissions: {
    readMainDb?: boolean;
    readPluginDbs?: string[];
    storage?: {
      quota: string;
      tables: string[];
    };
  };

  constructor(config: IPluginConfig) {
    this.permissions = config.claudeware?.permissions || {
      readMainDb: false,
      readPluginDbs: []
    };
  }

  canReadMainDb(): boolean {
    return this.permissions.readMainDb === true;
  }

  canReadPluginDb(pluginName: string): boolean {
    if (!pluginName) return false;
    return this.permissions.readPluginDbs?.includes(pluginName) || false;
  }

  getReadablePlugins(): string[] {
    return this.permissions.readPluginDbs || [];
  }

  validatePath(dbPath: string): void {
    // Must be absolute path
    if (!path.isAbsolute(dbPath)) {
      throw new SecurityError('Path must be absolute');
    }

    // Resolve to prevent path traversal
    const resolved = path.resolve(dbPath);

    // Define allowed base paths
    const allowedPaths = [
      path.join(process.env.HOME || '', '.claude-code'),
      path.join(process.env.HOME || '', '.claudeware')
    ];

    // Check if path starts with any allowed base path
    const isAllowed = allowedPaths.some(allowed => resolved.startsWith(allowed));

    if (!isAllowed) {
      throw new SecurityError(`Access denied: ${dbPath}`);
    }
  }

  async validateAndAttach(
    access: IPluginDataAccess,
    targetPath: string,
    targetPlugin: string
  ): Promise<void> {
    // Check permission first
    if (targetPlugin === 'main' || targetPlugin === 'claudeware') {
      if (!this.canReadMainDb()) {
        throw new PermissionError('No permission to read main database');
      }
    } else {
      if (!this.canReadPluginDb(targetPlugin)) {
        throw new PermissionError(`No permission to read ${targetPlugin} database`);
      }
    }

    // Validate path security
    this.validatePath(targetPath);

    // Attach if all checks pass
    await access.attachReadOnly(targetPath, targetPlugin);
  }
}