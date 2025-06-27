# CLAUDE.md - Claudeware Project Guide

This document contains essential information for Claude Code instances working with the Claudeware project.

## Project Overview

**Claudeware** is a zero-latency middleware system for Claude Code that enables query collection, analysis, and optimization through a plugin-based architecture. It works with both the Claude Code CLI and TypeScript SDK without any performance impact on output.

### Key Features
- **Zero-Latency Passthrough**: CLI output is never delayed by processing
- **Plugin System**: Extensible middleware architecture with error isolation
- **Query Collection**: Automatic storage and categorization of all queries
- **Token Optimization**: Identifies opportunities to save tokens and optimize model usage
- **SDK Integration**: Works seamlessly with both CLI and TypeScript SDK

## Architecture Summary

The wrapper uses a decoupled architecture to ensure zero latency:

```
Claude Code CLI → Process Manager → Stream Handler → Terminal (Direct Pipe)
                                           ↓
                                    JSON Parser → Event Bus → Plugins → Database
```

**Key Design Principle**: Output is piped directly to terminal while parallel processing happens in the background. This guarantees zero latency impact.

## Project Structure

```
claudeware/
├── src/                    # Source code (mixed JS/TS)
│   ├── core/              # Core components (TypeScript)
│   │   ├── json-parser.ts
│   │   ├── process-manager.ts
│   │   └── stream-handler.ts
│   ├── plugins/           # Plugin system (TypeScript)
│   │   ├── event-bus.ts
│   │   ├── plugin-loader.ts
│   │   └── builtin/       # Built-in plugins
│   ├── database/          # Data layer
│   │   ├── sqlite-adapter.ts
│   │   └── batch-queue.ts
│   ├── adapters/          # Integration adapters
│   │   └── sdk-adapter.ts
│   ├── cli.js            # CLI entry point (JavaScript)
│   ├── wrapper.js        # Main wrapper orchestrator (JavaScript)
│   └── sdk.js            # SDK integration (JavaScript)
├── docs/                  # Comprehensive documentation
├── examples/              # Example plugins and usage
├── test/                  # Test files
└── .dev/                  # Development status documents
```

## Implementation Status

As of the last update, the project is **feature complete** with all core components implemented:

### Completed Components (100%)
- ✅ JSON Stream Parser - Handles partial chunks, SSE format
- ✅ Event Bus - Event distribution with error isolation
- ✅ Batch Queue - Efficient batched database writes
- ✅ Plugin Loader - Dependency resolution, error isolation
- ✅ SQLite Adapter - High-performance local storage
- ✅ SDK Adapter - SDK integration layer
- ✅ Stream Handler - Zero-latency passthrough
- ✅ Process Manager - Child process lifecycle
- ✅ Query Collector Plugin - First production plugin

### Test Coverage
- Total Tests: 182
- Passing Tests: 173 (95%)
- Coverage: ~90%
- Known Issues: See `KNOWN-ISSUES.md` for timer test failures and workarounds

## Key Technical Details

### Database
- Uses SQLite with WAL (Write-Ahead Logging) mode for high concurrency
- Batch writes for performance optimization
- Schema includes queries, responses, analytics tables
- Located at `~/.claude-code/queries.db` by default

### Plugin System
- Plugins are loaded from `~/.claude-code/plugins/` by default
- Each plugin requires a `manifest.json` file
- Plugins run with timeouts and error isolation
- Inter-plugin communication via shared event bus
- Hot reloading planned for future releases

### Configuration
Configuration can be set via:
1. Environment variables (prefix: `CLAUDE_WRAPPER_`)
2. Config file: `~/.claude-code/wrapper.config.json`
3. Command-line arguments

### Error Handling
- Plugin failures don't affect Claude Code operation
- All errors are logged but isolated
- Circuit breaker pattern for repeated failures
- Graceful degradation when components fail

## Development Guidelines

### Running Tests
```bash
npm test                    # Run all tests
npm test -- <file>         # Run specific test file
npm run test:coverage      # Run with coverage
npm run test:manual        # Manual integration test
```

### Building
```bash
npm run build              # Build TypeScript files
npm link                   # Install globally for testing
```

### Key Commands
```bash
# Test the wrapper
./test-wrapper.sh

# Quick concept test
./simple-test.js

# Manual test
npm run test:manual
```

## Common Tasks

### Creating a Plugin
1. Create directory: `~/.claude-code/plugins/my-plugin/`
2. Add `manifest.json` with plugin metadata
3. Implement plugin interface in `index.js` or `index.ts`
4. Plugin will be auto-discovered on next run

### Viewing Collected Data
```sql
-- Connect to SQLite database
sqlite3 ~/.claude-code/queries.db

-- View recent queries
SELECT * FROM queries ORDER BY timestamp DESC LIMIT 10;

-- Analyze token usage
SELECT category, COUNT(*) as count, SUM(token_count) as total_tokens
FROM queries
GROUP BY category;
```

### SDK Integration
```javascript
import { createWrappedSDK } from 'claudeware';

const { query } = createWrappedSDK({
  pluginDirectory: './plugins',
  databasePath: './queries.db'
});

// Use like normal Claude Code SDK
for await (const msg of query('Hello Claude')) {
  console.log(msg);
}
```

## Important Notes

1. **Zero Latency is Sacred**: Any changes must maintain the zero-latency guarantee
2. **Plugin Isolation**: Plugins must never affect core operation
3. **Backward Compatibility**: CLI wrapper must be transparent to users
4. **Test Coverage**: Maintain high test coverage for all new features

## Debugging Tips

1. Enable debug logging: `export CLAUDE_WRAPPER_LOG_LEVEL=debug`
2. Test mode: `export CLAUDE_WRAPPER_TEST_MODE=true`
3. Check logs in: `~/.claude-code/logs/`
4. Database issues: Verify write permissions and disk space
5. Plugin issues: Check manifest.json and dependencies

## File Purposes

### Core Files
- `src/cli.js` - CLI entry point that intercepts claude-code commands
- `src/wrapper.js` - Main orchestrator that manages all components
- `src/sdk.js` - SDK wrapper factory for TypeScript SDK integration

### TypeScript Components
- `src/core/json-parser.ts` - Parses Claude's streaming JSON output
- `src/core/stream-handler.ts` - Implements zero-latency passthrough
- `src/core/process-manager.ts` - Manages Claude Code child process
- `src/plugins/event-bus.ts` - Distributes events to plugins
- `src/plugins/plugin-loader.ts` - Discovers and loads plugins
- `src/database/sqlite-adapter.ts` - Database interface
- `src/database/batch-queue.ts` - Batches database writes

### Documentation
- `docs/API-REFERENCE.md` - Complete API documentation
- `docs/ARCHITECTURE.md` - Deep technical dive
- `docs/PLUGIN-API.md` - Plugin developer guide
- `docs/QUICK-START.md` - 5-minute getting started
- `docs/TESTING.md` - Testing guide

## Future Enhancements

1. **Hot Reload**: Add/remove plugins without restart
2. **Remote Plugins**: Load plugins from URLs
3. **Cloud Sync**: Optional cloud storage for queries
4. **Web Dashboard**: Built-in analytics dashboard
5. **Performance Profiling**: Detailed performance metrics

## Contact & Resources

- GitHub Issues: Report bugs and feature requests
- Documentation: See `/docs` directory for detailed guides
- Examples: Check `/examples` for plugin examples

Remember: The primary goal is to provide value through query analysis and optimization while maintaining absolute zero impact on Claude Code's performance.