/**
 * Plugin configuration structure
 */
export interface IPluginConfig {
  claudeware?: {
    version: string;
    permissions: {
      readMainDb?: boolean;
      readPluginDbs?: string[];
      storage?: {
        quota: string;
        tables: string[];
      };
    };
  };
}