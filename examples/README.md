# Claudeware Examples

This directory contains example plugins demonstrating the Claudeware plugin API capabilities.

## Example Plugins

### 1. Token Monitor (`token-monitor/`)
Monitors Claude Code token usage and sends alerts when thresholds are exceeded.

**Features:**
- Daily token usage tracking
- Configurable limits and warning thresholds
- Webhook alerts for limit warnings
- Automatic daily reset
- Usage statistics API

**Configuration:**
```json
{
  "dailyLimit": 100000,
  "warningThreshold": 0.8,
  "alertWebhook": "https://your-webhook.com/alerts"
}
```

### 2. Cache Plugin (`cache/`)
Caches Claude responses to speed up repeated queries.

**Features:**
- LRU cache with configurable size
- Fuzzy matching for similar queries
- Persistence to disk between sessions
- Cache hit/miss metrics
- Time-to-live (TTL) support

**Configuration:**
```json
{
  "cacheSize": 100,
  "ttl": 3600000,
  "similarity": 0.95,
  "persistCache": true
}
```

### 3. Rate Limiter (`rate-limiter/`)
Prevents hitting API rate limits by throttling requests.

**Features:**
- Multiple time window limits (minute/hour/day)
- Request queuing when rate limited
- Burst support
- Sliding window algorithm
- Real-time status updates

**Configuration:**
```json
{
  "limits": {
    "perMinute": 10,
    "perHour": 100,
    "perDay": 1000
  },
  "queueEnabled": true,
  "burstSize": 5
}
```

### 4. Analytics Dashboard (`analytics-dashboard/`)
Provides real-time analytics via a web dashboard.

**Features:**
- Web dashboard on configurable port
- Real-time metrics updates
- Query categorization statistics
- Cost tracking by model
- Performance metrics (latency percentiles)
- Error tracking

**Configuration:**
```json
{
  "port": 3333,
  "host": "localhost",
  "updateInterval": 5000
}
```

## Installing Example Plugins

1. Copy the plugin directory to your plugins folder:
```bash
cp -r examples/plugins/token-monitor ~/.claude-code/plugins/
```

2. Enable the plugin in your configuration:
```json
{
  "plugins": {
    "enabledPlugins": ["token-monitor"]
  }
}
```

3. Restart Claudeware

## Creating Your Own Plugin

Use these examples as templates:

1. Copy an example plugin as a starting point
2. Update the `manifest.json` with your plugin details
3. Modify the implementation in `index.js`
4. Test with the wrapper

See the [Plugin API Documentation](../docs/PLUGIN-API.md) for the complete API reference.

## Plugin Ideas

Here are some ideas for plugins you could build:

- **Prompt Templates**: Store and reuse common prompts
- **Response Formatter**: Transform Claude's responses
- **Team Sharing**: Share queries and insights with your team
- **Cost Allocator**: Track costs by project or client
- **Backup Manager**: Automatic backups of important conversations
- **Query Router**: Route queries to different models based on complexity
- **Notification System**: Slack/Discord notifications for long-running queries
- **Security Scanner**: Scan queries for sensitive information
- **Performance Optimizer**: Suggest query optimizations
- **Integration Hub**: Connect to external services (Jira, GitHub, etc.)

## Contributing

If you create a useful plugin, consider contributing it back to the community! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.