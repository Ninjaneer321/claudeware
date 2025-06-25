# Quick Start Guide

Get up and running with Claude Code Wrapper in 5 minutes!

## Prerequisites

- Node.js 18 or later
- Claude Code CLI installed (`claude --version`)
- npm or yarn package manager

## Installation

### Option 1: Global Install (Recommended)

```bash
# Install globally
npm install -g claude-code-wrapper

# Verify installation
claude-code-wrapper --version
```

### Option 2: From Source

```bash
# Clone repository
git clone https://github.com/instantlyeasy/claude-code-wrapper.git
cd claude-code-wrapper

# Install dependencies
npm install

# Build project
npm run build

# Link globally
npm link
```

## Basic Usage

### CLI Wrapper

Once installed, the wrapper automatically intercepts Claude Code:

```bash
# Use Claude Code as normal
claude-code "Create a hello world function in Python"

# The output appears instantly, while data is collected in background
```

### SDK Integration

```typescript
// 1. Import the wrapper
import { createWrappedSDK } from 'claude-code-wrapper';

// 2. Create wrapped instance
const { query, getMetrics, shutdown } = createWrappedSDK();

// 3. Use like normal Claude Code SDK
async function main() {
  for await (const message of query('Hello Claude!')) {
    if (message.type === 'assistant') {
      console.log(message.content);
    }
  }
  
  // 4. Check metrics
  const metrics = await getMetrics();
  console.log('Events processed:', metrics.eventBus.totalEvents);
  
  // 5. Cleanup
  await shutdown();
}
```

## Your First Plugin

### 1. Create Plugin Directory

```bash
mkdir -p ~/.claude-code/plugins/my-first-plugin
cd ~/.claude-code/plugins/my-first-plugin
```

### 2. Create manifest.json

```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "description": "My first Claude Code plugin",
  "main": "./index.js",
  "timeout": 5000,
  "capabilities": ["logging"]
}
```

### 3. Create index.js

```javascript
class MyFirstPlugin {
  constructor() {
    this.name = 'my-first-plugin';
    this.version = '1.0.0';
    this.manifest = require('./manifest.json');
  }

  async initialize(context) {
    this.logger = context.logger.child({ plugin: this.name });
    this.logger.info('My plugin initialized!');
  }

  async onEvent(event, context) {
    if (event.type === 'query') {
      this.logger.info('Query received:', event.data.messages[0].content);
    } else if (event.type === 'response') {
      this.logger.info('Response received');
    }
  }

  async shutdown() {
    this.logger.info('Plugin shutting down');
  }
}

module.exports = MyFirstPlugin;
```

### 4. Test Your Plugin

```bash
# Run Claude Code with your plugin
claude-code "What is 2+2?"

# Check logs
tail -f ~/.claude-code/logs/wrapper.log
```

## Viewing Collected Data

### Using SQLite CLI

```bash
# Open the database
sqlite3 ~/.claude-code/queries.db

# View recent queries
SELECT datetime(timestamp, 'unixepoch') as time, query, category 
FROM queries 
ORDER BY timestamp DESC 
LIMIT 10;

# Check token usage
SELECT 
  date(timestamp, 'unixepoch') as day,
  SUM(token_count) as total_tokens
FROM queries
GROUP BY day;

# Exit
.quit
```

### Using Node.js

```javascript
import Database from 'better-sqlite3';

const db = new Database('~/.claude-code/queries.db');

// Get today's queries
const today = db.prepare(`
  SELECT * FROM queries 
  WHERE timestamp > unixepoch('now', '-1 day')
`).all();

console.log(`Queries today: ${today.length}`);

// Get category breakdown
const categories = db.prepare(`
  SELECT category, COUNT(*) as count
  FROM queries
  GROUP BY category
`).all();

console.table(categories);

db.close();
```

## Configuration

### Basic Configuration

Create `~/.claude-code/config.json`:

```json
{
  "plugins": {
    "enabledPlugins": ["query-collector", "my-first-plugin"],
    "disabledPlugins": []
  },
  "database": {
    "path": "~/.claude-code/queries.db"
  },
  "logging": {
    "level": "info",
    "path": "~/.claude-code/logs/wrapper.log"
  }
}
```

### Environment Variables

```bash
# Set log level
export CLAUDE_WRAPPER_LOG_LEVEL=debug

# Set custom plugin directory
export CLAUDE_WRAPPER_PLUGINS_DIR=/my/plugins

# Set custom database path
export CLAUDE_WRAPPER_DB_PATH=/my/data/queries.db
```

## Common Use Cases

### 1. Track Token Usage

```javascript
// View token usage over time
const tokenUsage = db.prepare(`
  SELECT 
    date(timestamp, 'unixepoch') as date,
    SUM(r.input_tokens + r.output_tokens) as total_tokens,
    COUNT(DISTINCT q.id) as query_count
  FROM queries q
  JOIN responses r ON q.id = r.query_id
  GROUP BY date
  ORDER BY date DESC
`).all();

console.table(tokenUsage);
```

### 2. Find Expensive Queries

```javascript
// Find queries using the most tokens
const expensive = db.prepare(`
  SELECT 
    q.query,
    q.model,
    r.input_tokens + r.output_tokens as total_tokens
  FROM queries q
  JOIN responses r ON q.id = r.query_id
  ORDER BY total_tokens DESC
  LIMIT 10
`).all();

console.log('Most expensive queries:');
expensive.forEach(q => {
  console.log(`${q.total_tokens} tokens: ${q.query.substring(0, 50)}...`);
});
```

### 3. Analyze Query Patterns

```javascript
// Category breakdown
const patterns = db.prepare(`
  SELECT 
    category,
    complexity,
    COUNT(*) as count,
    AVG(token_count) as avg_tokens
  FROM queries
  GROUP BY category, complexity
  ORDER BY count DESC
`).all();

console.log('Query patterns:');
console.table(patterns);
```

## Troubleshooting

### Wrapper Not Working

1. Check installation:
```bash
which claude-code-wrapper
claude-code-wrapper --version
```

2. Check logs:
```bash
tail -f ~/.claude-code/logs/wrapper.log
```

3. Test directly:
```bash
claude-code-wrapper test
```

### Plugin Not Loading

1. Check manifest:
```bash
cat ~/.claude-code/plugins/my-plugin/manifest.json | jq .
```

2. Check syntax:
```bash
node -c ~/.claude-code/plugins/my-plugin/index.js
```

3. Enable debug logging:
```bash
export CLAUDE_WRAPPER_LOG_LEVEL=debug
claude-code "test"
```

### Database Issues

1. Check permissions:
```bash
ls -la ~/.claude-code/queries.db
```

2. Check disk space:
```bash
df -h ~/.claude-code/
```

3. Reset database:
```bash
rm ~/.claude-code/queries.db
claude-code-wrapper init-db
```

## Next Steps

Now that you have the basics working:

1. **Explore Built-in Plugins**
   - Query Collector: Automatic categorization
   - Rate Limiter: Prevent API limits
   - Cache: Speed up repeated queries

2. **Build Custom Plugins**
   - See [Plugin API Documentation](./PLUGIN-API.md)
   - Check [example plugins](../examples/plugins/)

3. **Analyze Your Usage**
   - Generate reports
   - Find optimization opportunities
   - Track costs

4. **Integrate with Your Workflow**
   - Use SDK in your applications
   - Create custom analytics
   - Build team dashboards

## Getting Help

- 📖 [Full Documentation](../README.md)
- 🏗️ [Architecture Guide](./ARCHITECTURE.md)
- 🔌 [Plugin API](./PLUGIN-API.md)
- 💬 [Discord Community](https://discord.gg/claude-wrapper)
- 🐛 [Report Issues](https://github.com/instantlyeasy/claude-code-wrapper/issues)

Happy querying! 🚀