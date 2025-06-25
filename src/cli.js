#!/usr/bin/env node

/**
 * Claude Code Wrapper CLI
 * 
 * Main entry point for the wrapper command-line interface.
 * Intercepts Claude Code execution with zero-latency passthrough.
 */

const { ClaudeWrapper } = require('./wrapper');
const path = require('path');
const fs = require('fs');

async function main() {
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
    console.error('Error:', error.message);
    if (process.env.CLAUDE_WRAPPER_LOG_LEVEL === 'debug') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function loadConfig(args) {
  // Default configuration
  const config = {
    mode: process.env.NODE_ENV || 'production',
    claudePath: process.env.CLAUDE_PATH || 'claude',
    wrapper: {
      timeout: 300000, // 5 minutes
      bufferSize: 65536,
      gracefulShutdownTimeout: 5000
    },
    plugins: {
      directory: process.env.CLAUDE_WRAPPER_PLUGINS_DIR || expandPath('~/.claude-code/plugins'),
      timeout: 5000,
      enabledPlugins: [],
      disabledPlugins: []
    },
    database: {
      type: 'sqlite',
      path: process.env.CLAUDE_WRAPPER_DB_PATH || expandPath('~/.claude-code/queries.db'),
      batchSize: 100,
      flushInterval: 1000,
      walMode: true
    },
    monitoring: {
      enabled: true,
      logLevel: process.env.CLAUDE_WRAPPER_LOG_LEVEL || 'info',
      logPath: expandPath('~/.claude-code/logs/wrapper.log')
    }
  };

  // Parse command line overrides
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--mode':
        config.mode = args[++i];
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
        config.monitoring.logLevel = args[++i];
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
      console.warn('Warning: Failed to load config file:', error.message);
    }
  }

  // Test mode overrides
  if (process.env.CLAUDE_WRAPPER_TEST_MODE) {
    config.mode = 'test';
    config.database.path = ':memory:';
    config.monitoring.logLevel = 'debug';
  }

  return config;
}

function mergeConfig(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = target[key] || {};
      mergeConfig(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

function expandPath(filePath) {
  if (filePath.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE;
    return path.join(home, filePath.slice(1));
  }
  return path.resolve(filePath);
}

function showHelp() {
  console.log(`
Claude Code Wrapper - Query collection and analysis for Claude Code

Usage: claude-code-wrapper [options] [claude-args...]

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
  claude-code-wrapper "What is 2+2?"
  
  # Enable specific plugins
  claude-code-wrapper --enable-plugins query-collector,cache "Explain recursion"
  
  # Custom database location
  claude-code-wrapper --db-path ./my-queries.db "Create a Python function"
  
  # Debug mode
  CLAUDE_WRAPPER_LOG_LEVEL=debug claude-code-wrapper "Debug this code"

Documentation: https://github.com/yourusername/claude-code-wrapper
`);
}

function showVersion() {
  const packagePath = path.join(__dirname, '../package.json');
  const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  console.log(`claude-code-wrapper v${package.version}`);
}

// Run the CLI
if (require.main === module) {
  main();
}

module.exports = { main };