import { IPluginDataAccess } from './IPluginDataAccess';

/**
 * Interface for validating plugin permissions
 * Ensures plugins only access allowed resources
 */
export interface IPermissionValidator {
  /**
   * Check if plugin can read the main database
   */
  canReadMainDb(): boolean;

  /**
   * Check if plugin can read another plugin's database
   * @param pluginName Name of the target plugin
   */
  canReadPluginDb(pluginName: string): boolean;

  /**
   * Get list of readable plugin databases
   */
  getReadablePlugins(): string[];

  /**
   * Validate a database path is allowed
   * @param dbPath Path to validate
   * @throws {SecurityError} If path is not allowed
   */
  validatePath(dbPath: string): void;

  /**
   * Validate and attach a plugin database
   * @param access Data access instance
   * @param targetPath Database path
   * @param targetPlugin Plugin name
   */
  validateAndAttach(
    access: IPluginDataAccess,
    targetPath: string,
    targetPlugin: string
  ): Promise<void>;
}