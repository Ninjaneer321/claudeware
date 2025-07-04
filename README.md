# Claudeware

Zero-latency middleware for Claude Code that enables query collection, analysis, and optimization through a plugin-based architecture.

[![npm version](https://badge.fury.io/js/@instantlyeasy%2Fclaudeware.svg)](https://www.npmjs.com/package/@instantlyeasy/claudeware)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Zero-Latency Passthrough**: CLI output is never delayed by processing
- **Plugin System**: Extensible middleware architecture
- **Query Collection**: Automatic storage and categorization of all queries
- **SDK Integration**: Works with both CLI and TypeScript SDK
- **Token Optimization**: Identifies opportunities to save tokens
- **Error Isolation**: Plugin failures don't affect Claude Code operation
- **Hot Reloading**: Add/remove plugins without restart (coming soon)


## Installation

### Prerequisites

- Node.js 18+ 
- Claude Code CLI installed and authenticated
- TypeScript (for development)

### Install from npm

```bash
npm install -g @instantlyeasy/claudeware
```

### Install from source

```bash
git clone https://github.com/instantlyeasy/claudeware.git
cd claudeware
npm install
npm run build
npm link
```

## Quick Start

### CLI Usage

Simply prefix your Claude Code commands with `claudeware`:

```bash
# Instead of:
claude-code "What is 2 + 2?"

# Use:
claudeware "What is 2 + 2?"
```

All Claude Code functionality remains unchanged, but your queries are now being collected and analyzed in the background.

### SDK Usage

```typescript
import { createWrappedSDK } from '@instantlyeasy/claudeware';

// Create wrapped SDK instance  
const wrappedClaude = createWrappedSDK({
  pluginDirectory: '~/.claude-code/plugins',
  databasePath: './queries.db'
});

// Use exactly like the Claude Code SDK
const result = await wrappedClaude()
  .withModel('sonnet')
  .query('Hello Claude')
  .asText();

// Get metrics from plugins
const metrics = await wrappedClaude.getMetrics();
console.log('Tokens used:', metrics.sessionMetrics.totalTokens);
```

See the [SDK integration examples](examples/sdk-integration/) for comprehensive usage patterns.

## Architecture

The wrapper uses a decoupled architecture to ensure zero latency:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│ Process Manager │────▶│ Stream Handler  │
│      CLI        │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └───────┬─────────┘
                                                         │
                                    ┌────────────────────┴───────┐
                                    │                            │
                              Direct Pipe                  JSON Parser
                              (Zero Latency)              (Processing)
                                    │                            │
                                    ▼                            ▼
                              Terminal Output              Event Bus
                                                               │
                                                         ┌─────┴─────┐
                                                         ▼           ▼
                                                      Plugins    Database
```

### Key Components

1. **Process Manager**: Manages Claude Code child process lifecycle
2. **Stream Handler**: Implements zero-latency passthrough with parallel processing
3. **Event Bus**: Distributes events to plugins with error isolation
4. **Plugin Loader**: Discovers and manages plugins with dependency resolution
5. **Database Layer**: SQLite storage with batching and analytics

## Configuration

### Environment Variables

```bash
# Wrapper configuration
CLAUDE_WRAPPER_MODE=production          # production | development
CLAUDE_WRAPPER_PLUGINS_DIR=~/.claude-code/plugins
CLAUDE_WRAPPER_DB_PATH=./claude-queries.db
CLAUDE_WRAPPER_LOG_LEVEL=info          # debug | info | warn | error

# Plugin configuration
CLAUDE_WRAPPER_PLUGIN_TIMEOUT=5000      # Plugin execution timeout (ms)
CLAUDE_WRAPPER_PLUGIN_RETRIES=3         # Retry attempts for failed plugins
```

### Configuration File

Create `~/.claude-code/wrapper.config.json`:

```json
{
  "wrapper": {
    "timeout": 30000,
    "bufferSize": 65536,
    "gracefulShutdownTimeout": 5000
  },
  "plugins": {
    "directory": "~/.claude-code/plugins",
    "timeout": 5000,
    "retryAttempts": 3,
    "enabledPlugins": ["query-collector", "rate-limiter"],
    "disabledPlugins": []
  },
  "database": {
    "type": "sqlite",
    "path": "~/.claude-code/queries.db",
    "batchSize": 100,
    "flushInterval": 1000,
    "walMode": true
  },
  "monitoring": {
    "enabled": true,
    "metricsPort": 9090,
    "logLevel": "info"
  }
}
```

## Plugin System

The claudeware wrapper includes a powerful plugin system for extending functionality.

### Built-in Plugins

#### Query Collector Plugin

Automatically categorizes and analyzes all queries:

```json
{
  "name": "query-collector",
  "version": "1.0.0",
  "capabilities": ["query-analysis", "optimization-suggestions"]
}
```

Features:
- Categorizes queries (code, debug, explain, refactor, test)
- Calculates complexity (low, medium, high)
- Suggests model optimizations
- Tracks token usage

### Creating Custom Plugins

See [Plugin API Documentation](./docs/PLUGIN-API.md) for detailed information.

Quick example:

```typescript
// my-plugin/index.ts
export default class MyPlugin implements Plugin {
  name = 'my-plugin';
  version = '1.0.0';
  manifest = {
    name: 'my-plugin',
    version: '1.0.0',
    dependencies: [],
    priority: 10,
    timeout: 5000,
    capabilities: ['custom-analysis']
  };

  async initialize(context: PluginContext) {
    context.logger.info('MyPlugin initialized');
  }

  async onEvent(event: QueryEvent, context: PluginContext) {
    if (event.type === 'query') {
      // Process query
      await context.dataStore.saveQuery({
        id: event.id,
        query: event.data.content,
        // ... additional processing
      });
    }
  }

  async shutdown() {
    // Cleanup
  }
}
```

### Installing Plugins

1. Create plugin directory:
```bash
mkdir -p ~/.claude-code/plugins/my-plugin
```

2. Add manifest.json:
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "./index.js",
  "dependencies": [],
  "priority": 10,
  "timeout": 5000,
  "capabilities": ["custom-analysis"]
}
```

3. Add your plugin code
4. Restart wrapper (or wait for hot reload)

## SDK Integration

The wrapper provides seamless SDK integration:

```typescript
import { createWrappedSDK } from 'claudeware';
import { claude } from '@instantlyeasy/claude-code-sdk-ts';

// Option 1: Use wrapped SDK factory
const wrappedSDK = createWrappedSDK({
  pluginDirectory: './plugins',
  enabledPlugins: ['query-collector', 'cache']
});

// Option 2: Manual integration with existing SDK
const client = claude()
  .withRetry({ maxAttempts: 3 })
  .build();

// Wrap with plugin support
const { query } = wrapSDK(client, {
  plugins: ['query-collector']
});
```

## Query Analytics

Access collected query data:

```typescript
import Database from 'better-sqlite3';

const db = new Database('~/.claude-code/queries.db');

// Get query statistics
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total_queries,
    SUM(token_count) as total_tokens,
    AVG(latency_ms) as avg_latency
  FROM queries
  WHERE timestamp > datetime('now', '-7 days')
`).get();

// Get queries by category
const categories = db.prepare(`
  SELECT category, COUNT(*) as count
  FROM queries
  GROUP BY category
  ORDER BY count DESC
`).all();

// Find optimization opportunities
const expensiveSimpleQueries = db.prepare(`
  SELECT q.*, r.input_tokens + r.output_tokens as total_tokens
  FROM queries q
  JOIN responses r ON q.id = r.query_id
  WHERE q.complexity = 'low' 
    AND q.model LIKE '%opus%'
    AND total_tokens < 100
  ORDER BY total_tokens DESC
`).all();
```

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/instantlyeasy/claudeware.git
cd claudeware

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run in development mode
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific component tests
npm test stream-handler
npm test plugin-loader

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Project Structure

```
claudeware/
├── src/
│   ├── core/               # Core components
│   │   ├── wrapper.ts      # Main wrapper orchestrator
│   │   ├── stream-handler.ts
│   │   ├── process-manager.ts
│   │   └── json-parser.ts
│   ├── plugins/            # Plugin system
│   │   ├── plugin-loader.ts
│   │   ├── event-bus.ts
│   │   └── builtin/        # Built-in plugins
│   ├── database/           # Data layer
│   │   ├── sqlite-adapter.ts
│   │   └── batch-queue.ts
│   ├── adapters/           # Integration adapters
│   │   └── sdk-adapter.ts
│   └── types/              # TypeScript types
├── tests/                  # Test suites
├── docs/                   # Documentation
└── examples/               # Usage examples
```

## API Reference

### Core APIs

#### `createWrappedSDK(config: WrapperConfig)`

Creates a wrapped SDK instance with plugin support.

```typescript
const { query, getMetrics, shutdown } = createWrappedSDK({
  pluginDirectory: './plugins',
  databasePath: './queries.db',
  enabledPlugins: ['query-collector'],
  logLevel: 'info'
});
```

#### `ClaudeWrapper`

Main wrapper class for CLI integration.

```typescript
const wrapper = new ClaudeWrapper(config);
await wrapper.start(args, stdin, stdout, stderr);
```

See [API Documentation](./docs/API.md) for complete reference.

## Troubleshooting

### Common Issues

1. **Wrapper not intercepting Claude Code**
   - Ensure wrapper is installed globally
   - Check PATH environment variable
   - Verify installation with `which claude-code`

2. **Plugin not loading**
   - Check plugin manifest.json
   - Verify plugin dependencies
   - Check logs for errors

3. **Database errors**
   - Ensure write permissions
   - Check disk space
   - Verify SQLite installation

### Debug Mode

Enable debug logging:

```bash
export CLAUDE_WRAPPER_LOG_LEVEL=debug
claude-code "test query"
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

Built with:
- [Claude Code CLI](https://github.com/anthropics/claude-code)
- [Claude Code SDK](https://github.com/instantlyeasy/claude-code-sdk-ts)
- [Better SQLite3](https://github.com/WiseLibs/better-sqlite3)
- [Pino](https://github.com/pinojs/pino)
- [TypeScript](https://www.typescriptlang.org/)

---

For more information:
- [Plugin API Documentation](docs/PLUGIN-API.md)
- [Architecture Deep Dive](docs/ARCHITECTURE.md)
- [Quick Start Guide](docs/QUICK-START.md)
- [Testing Guide](docs/TESTING.md)