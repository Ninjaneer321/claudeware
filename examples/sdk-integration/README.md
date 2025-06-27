# Claudeware SDK Integration Examples

This directory contains examples showing how to use Claudeware with the Claude Code SDK TypeScript library.

## Prerequisites

```bash
npm install @instantlyeasy/claude-code-sdk-ts @timmytown/claudeware
```

## Examples

### 1. Simple Wrapper Demo (`simple-wrapper-demo.ts`)

The easiest way to get started. Shows basic usage and automatic query collection.

```bash
npx tsx simple-wrapper-demo.ts
```

**Features demonstrated:**
- Automatic query/response storage
- Token usage tracking
- Performance monitoring
- Zero configuration setup

### 2. Comprehensive Examples (`wrapped-claude-sdk.ts`)

Advanced examples showing all features of the wrapped SDK.

```bash
npx tsx wrapped-claude-sdk.ts
```

**Features demonstrated:**
- Different query types (text, streaming)
- Tool usage monitoring
- Model fallback patterns
- Research sessions with context
- Metrics export
- Plugin integration

### 3. Query Analysis (`analyze-queries.ts`)

Shows how to analyze collected queries for insights and optimization.

```bash
npx tsx analyze-queries.ts
```

**Analysis includes:**
- Usage statistics
- Model distribution
- Cost estimation
- Optimization opportunities
- Duplicate detection
- Usage patterns

## Key Benefits of Claudeware

1. **Zero Latency**: Monitoring doesn't slow down Claude responses
2. **Automatic Collection**: All queries/responses are stored automatically
3. **Token Tracking**: Monitor token usage across models
4. **Cost Analysis**: Understand and optimize API costs
5. **Plugin System**: Extend with custom analysis plugins
6. **SDK Compatible**: Works with all Claude Code SDK features

## Basic Usage Pattern

```typescript
import { createWrappedSDK } from '@timmytown/claudeware';

// Create wrapped instance
const wrappedClaude = createWrappedSDK({
  databasePath: './my-queries.db'
});

// Use exactly like the regular SDK
const result = await wrappedClaude()
  .withModel('sonnet')
  .query('Your query here')
  .asText();

// Get metrics anytime
const metrics = await wrappedClaude.getMetrics();
console.log('Tokens used:', metrics.sessionMetrics.totalTokens);
```

## Database Schema

Queries are stored in SQLite with the following schema:

```sql
CREATE TABLE queries (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  timestamp TEXT,
  model TEXT,
  query_text TEXT,
  query_messages TEXT,  -- JSON
  response_text TEXT,
  response_messages TEXT,  -- JSON
  token_count INTEGER,
  latency INTEGER,
  metadata TEXT  -- JSON (categories, suggestions, etc.)
);
```

## Custom Plugins

You can create custom plugins to analyze queries in real-time:

```typescript
// ~/.claude-code/plugins/my-analyzer/index.js
module.exports = {
  name: 'my-analyzer',
  version: '1.0.0',
  
  async onEvent(event, context) {
    if (event.type === 'query') {
      // Analyze the query
      console.log('Query length:', event.data.text.length);
    }
  }
};
```

## Tips

1. **Development vs Production**: Use in-memory database during development:
   ```typescript
   createWrappedSDK({ databasePath: ':memory:' })
   ```

2. **Selective Monitoring**: Enable/disable for specific queries:
   ```typescript
   // This query won't be collected
   const unwrapped = claude();
   
   // This query will be collected  
   const wrapped = wrappedClaude();
   ```

3. **Export Data**: Regularly export metrics for long-term analysis:
   ```typescript
   const metrics = await wrappedClaude.getMetrics();
   fs.writeFileSync('metrics.json', JSON.stringify(metrics));
   ```

## Troubleshooting

- **Database locked**: Ensure you call `shutdown()` when done
- **Missing metrics**: Check that plugins are loaded correctly
- **High latency**: Verify you're not in debug mode with verbose logging

## Further Reading

- [Claudeware Documentation](../../docs/README.md)
- [Plugin Development Guide](../../docs/PLUGIN-API.md)
- [Claude Code SDK Documentation](https://github.com/instantlyeasy/claude-code-sdk-ts)