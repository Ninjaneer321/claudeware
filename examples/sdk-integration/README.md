# Claude Code SDK + Claudeware Integration Examples

This directory contains examples demonstrating how to integrate the Claude Code SDK with Claudeware for enhanced analytics and project automation.

## Prerequisites

1. Make sure you're logged into Claude Code CLI:
   ```bash
   claude-code login
   ```

2. Install the required packages:
   ```bash
   npm install @instantlyeasy/claude-code-sdk-ts @instantlyeasy/claudeware
   ```

**Note**: Authentication is handled by the Claude Code CLI. You don't need to set any API keys - just make sure you're logged in to Claude Code.

## Examples

### 1. 🏗️ Express Service Scaffolding Demo (`express-scaffolding-demo.ts`) ⭐

**The crown jewel example** - A comprehensive project scaffolding system that demonstrates the power of combining the Claude Code SDK's advanced features with Claudeware's analytics capabilities.

```bash
npm run scaffold
```

**Features:**
- 🏗️ **Complete Express.js service generation** with TypeScript
- 🔐 **Authentication system** (JWT-based)
- 🗄️ **Database integration** (SQLite/PostgreSQL/MySQL)
- 🧪 **Testing suite** (Jest + Supertest)
- 🐳 **Docker configuration** (multi-stage builds)
- 📚 **Comprehensive documentation** (README, API docs, deployment guides)
- 📊 **Claudeware analytics** (tracks tokens, timing, files created)

**SDK Features Demonstrated:**
- **Role-based prompting** (`withRole('senior-fullstack-developer')`)
- **Tool permissions** (`allowTools('Write', 'MultiEdit')`)
- **Response handlers** (`onToolUse()`, `onMessage()`)
- **Timeout management** (`withTimeout(45000)`)
- **Structured parsing** (`waitForCompletion()`)

**Claudeware Features Demonstrated:**
- **Analytics tracking** (tokens, timing, files created)
- **Database integration** (SQLite analytics storage)
- **Plugin system** (query-collector plugin)
- **Performance monitoring** (scaffolding time, tokens per file)

### 2. Simple Wrapper Demo (`simple-wrapper-demo.ts`)

The easiest way to get started. Shows basic usage and automatic query collection.

```bash
npm run simple
```

**Features demonstrated:**
- Automatic query/response storage
- Token usage tracking
- Performance monitoring
- Zero configuration setup

### 3. Advanced SDK Integration (`wrapped-claude-sdk.ts`)

Advanced patterns for SDK integration with custom analytics.

```bash
npm run advanced
```

**Features demonstrated:**
- Different query types (text, streaming)
- Tool usage monitoring
- Model fallback patterns
- Research sessions with context
- Metrics export
- Plugin integration

### 4. Query Analysis (`analyze-queries.ts`)

Shows how to analyze collected queries for insights and optimization.

```bash
npm run analyze
```

**Analysis includes:**
- Usage statistics
- Model distribution
- Cost estimation
- Optimization opportunities
- Duplicate detection
- Usage patterns

## Key Integration Patterns

### 1. Direct SDK Wrapping (No Interceptors Needed)

```typescript
class ClaudewareSDK {
  async scaffoldProject(config: ProjectConfig) {
    // Start Claudeware analytics
    const analytics = this.startTracking();
    
    // Use SDK with all its features
    const result = await claude()
      .withRole('senior-developer')          // SDK role system
      .allowTools('Write', 'MultiEdit')      // SDK permissions
      .onToolUse(tool => analytics.track(tool))  // Claudeware analytics
      .onMessage(msg => analytics.track(msg))    // Response tracking
      .query(prompt)
      .asText();
    
    // Complete analytics
    analytics.complete(result);
    return result;
  }
}
```

### 2. Response Processing for Analytics

```typescript
const result = await claude()
  .withRole('architect')
  .onMessage(msg => {
    // Real-time analytics without interceptors
    claudeware.trackMessage(msg);
    
    if (msg.type === 'assistant') {
      // Track token usage
      const tokens = msg.content.reduce((count, block) => 
        count + (block.type === 'text' ? block.text.split(' ').length : 0), 0
      );
      claudeware.trackTokens(tokens);
    }
  })
  .onToolUse(tool => {
    // Track tool usage
    claudeware.trackTool(tool.name, tool.input);
  })
  .query(prompt);
```

### 3. Configuration Bridge

```typescript
// Map Claudeware config to SDK options
const sdkOptions = claudeware.config.toSDKOptions();

const result = await claude()
  .withModel(sdkOptions.model)
  .allowTools(...sdkOptions.allowedTools)
  .withTimeout(sdkOptions.timeout)
  .query(prompt);
```

## Why This Integration Works

1. **Best of Both Worlds**: SDK's developer experience + Claudeware's analytics
2. **No Interceptors Needed**: Direct composition is simpler and more powerful
3. **Full Feature Access**: All SDK features work without modification
4. **Superior Analytics**: Process-level tracking + message-level insights
5. **Performance**: Zero overhead when not using analytics

## Key Benefits of Claudeware

1. **Zero Latency**: Monitoring doesn't slow down Claude responses
2. **Automatic Collection**: All queries/responses are stored automatically
3. **Token Tracking**: Monitor token usage across models
4. **Cost Analysis**: Understand and optimize API costs
5. **Plugin System**: Extend with custom analysis plugins
6. **SDK Compatible**: Works with all Claude Code SDK features

## Basic Usage Pattern

```typescript
import { createWrappedSDK } from '@instantlyeasy/claudeware';

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

## Quick Start

```bash
# Install dependencies
npm install

# Run the Express scaffolding demo (recommended!)
npm run scaffold

# Explore other examples
npm run simple
npm run advanced
npm run analyze

# Clean up generated files
npm run clean
```

## Output from Express Scaffolding

The Express scaffolding demo generates:
- A complete Express.js service with 15+ files
- Analytics report (`express-scaffolding-analytics.json`)
- Claudeware database (`express-scaffolding.db`)
- Ready-to-run project in `my-express-api/`

After scaffolding:
```bash
cd my-express-api
npm install
npm run dev
# Visit http://localhost:3000/health
```

## Further Reading

- [Claudeware Documentation](../../docs/README.md)
- [Plugin Development Guide](../../docs/PLUGIN-API.md)
- [Claude Code SDK Documentation](https://github.com/instantlyeasy/claude-code-sdk-ts)