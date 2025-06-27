#!/usr/bin/env node

/**
 * Claudeware CLI
 *
 * Main entry point for the wrapper command-line interface.
 * Intercepts Claude Code execution with zero-latency passthrough.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-console */
const { ClaudeWrapper } = require('./wrapper');
import * as path from 'path';
import * as fs from 'fs';
import { WrapperConfig } from './types/config';

async function main(): Promise<void> {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);

    // Check for help
    if (args.includes('--help') || args.includes('-h')) {
      showHelp();
      process.exit(0);
    }

    // Check for version
    if (args.includes('--version') || args.includes('-v')) {
      showVersion();
      process.exit(0);
    }

    // Load configuration
    const config = loadConfig(args);

    // Create wrapper instance
    const wrapper = new ClaudeWrapper(config);

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      await wrapper.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await wrapper.shutdown();
      process.exit(0);
    });

    // Start the wrapper
    await wrapper.start(
      args.filter(arg => !arg.startsWith('--')),
      process.stdin,
      process.stdout,
      process.stderr
    );

  } catch (error) {
    console.error('Error:', (error as Error).message);
    if (process.env.CLAUDE_WRAPPER_LOG_LEVEL === 'debug') {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

function loadConfig(args: string[]): WrapperConfig {
  // Default configuration
  const config: WrapperConfig = {
    mode: (process.env.NODE_ENV || 'production') as 'development' | 'production',
    claudePath: process.env.CLAUDE_PATH || 'claude',
    wrapper: {
      timeout: 300000, // 5 minutes
      bufferSize: 65536,
      gracefulShutdownTimeout: 5000
    },
    plugins: {
      directory: process.env.CLAUDE_WRAPPER_PLUGINS_DIR || expandPath('~/.claude-code/plugins'),
      timeout: 5000,
      retryAttempts: 3,
      enabledPlugins: [],
      disabledPlugins: []
    },
    database: {
      type: 'sqlite' as const,
      path: process.env.CLAUDE_WRAPPER_DB_PATH || expandPath('~/.claude-code/queries.db'),
      batchSize: 100,
      flushInterval: 1000,
      walMode: true
    },
    monitoring: {
      enabled: true,
      logLevel: (process.env.CLAUDE_WRAPPER_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
      logPath: expandPath('~/.claude-code/logs/wrapper.log')
    },
    categorization: {
      cacheSize: 1000,
      patterns: []
    }
  };

  // Parse command line overrides
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--mode':
        config.mode = args[++i] as 'development' | 'production';
        break;
      case '--claude-path':
        config.claudePath = args[++i];
        break;
      case '--db-path':
        config.database.path = args[++i];
        break;
      case '--plugins-dir':
        config.plugins.directory = args[++i];
        break;
      case '--enable-plugins':
        config.plugins.enabledPlugins = args[++i].split(',');
        break;
      case '--disable-plugins':
        config.plugins.disabledPlugins = args[++i].split(',');
        break;
      case '--log-level':
        config.monitoring.logLevel = args[++i] as 'debug' | 'info' | 'warn' | 'error';
        break;
    }
  }

  // Load config file if exists
  const configPath = expandPath('~/.claude-code/config.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      mergeConfig(config, fileConfig);
    } catch (error) {
      console.warn('Warning: Failed to load config file:', (error as Error).message);
    }
  }

  // Test mode overrides
  if (process.env.CLAUDE_WRAPPER_TEST_MODE) {
    config.mode = 'development';
    config.database.path = ':memory:';
    config.monitoring.logLevel = 'debug';
  }

  return config;
}

function mergeConfig(target: Record<string, any>, source: Record<string, any>): void {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = target[key] || {};
      mergeConfig(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, filePath.slice(1));
  }
  return path.resolve(filePath);
}

function showHelp(): void {
  console.log(`
Claudeware - Query collection and analysis for Claude Code

Usage: claudeware [options] [claude-args...]

Options:
  --help, -h              Show this help message
  --version, -v           Show version information
  --mode <mode>          Set mode (development, production, test)
  --claude-path <path>   Path to Claude executable
  --db-path <path>       Database file path
  --plugins-dir <path>   Plugins directory path
  --enable-plugins <list> Comma-separated list of plugins to enable
  --disable-plugins <list> Comma-separated list of plugins to disable
  --log-level <level>    Log level (debug, info, warn, error)

Environment Variables:
  CLAUDE_PATH                   Path to Claude executable
  CLAUDE_WRAPPER_PLUGINS_DIR    Plugins directory
  CLAUDE_WRAPPER_DB_PATH        Database file path
  CLAUDE_WRAPPER_LOG_LEVEL      Log level
  CLAUDE_WRAPPER_TEST_MODE      Enable test mode

Examples:
  # Basic usage
  claudeware "What is 2+2?"
  
  # Enable specific plugins
  claudeware --enable-plugins query-collector,cache "Explain recursion"
  
  # Custom database location
  claudeware --db-path ./my-queries.db "Create a Python function"
  
  # Debug mode
  CLAUDE_WRAPPER_LOG_LEVEL=debug claudeware "Debug this code"

Documentation: https://github.com/yourusername/claudeware
`);
}

function showVersion(): void {
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  console.log(`claudeware v${packageJson.version}`);
}

// Run the CLI
if (require.main === module) {
  main();
}

export { main };