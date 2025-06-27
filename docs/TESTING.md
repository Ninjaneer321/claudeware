# Testing Guide

This guide covers all aspects of testing the Claudeware.

## Table of Contents

1. [Unit Tests](#unit-tests)
2. [Integration Tests](#integration-tests)
3. [Manual Testing](#manual-testing)
4. [Plugin Testing](#plugin-testing)
5. [End-to-End Testing](#end-to-end-testing)
6. [Performance Testing](#performance-testing)

## Unit Tests

### Running Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/core/json-parser.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="parse.*JSON"
```

### Test Structure

Our test suite includes:
- **JSON Parser**: 18 test cases
- **Event Bus**: 20 test cases
- **Batch Queue**: 21 test cases
- **Plugin Loader**: 16 test cases
- **SQLite Adapter**: 19 test cases
- **SDK Adapter**: 39 test cases
- **Stream Handler**: 11 test cases
- **Process Manager**: 20 test cases
- **Query Collector Plugin**: 18 test cases

### Known Issues

- Batch Queue timer tests may fail with Jest fake timers (production code works correctly)

## Integration Tests

### 1. CLI Integration Test

Create `test/integration/cli-integration.test.js`:

```javascript
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

describe('CLI Integration', () => {
  test('wrapper passes through Claude output', async () => {
    const wrapper = spawn('node', [
      path.join(__dirname, '../../src/cli.js'),
      'echo "Hello from Claude"'
    ]);

    let output = '';
    wrapper.stdout.on('data', (data) => {
      output += data.toString();
    });

    await new Promise((resolve) => {
      wrapper.on('exit', resolve);
    });

    expect(output).toContain('Hello from Claude');
  });

  test('wrapper creates database', async () => {
    const dbPath = path.join(__dirname, '../../test-queries.db');
    
    // Remove if exists
    try {
      await fs.unlink(dbPath);
    } catch {}

    // Run wrapper
    const wrapper = spawn('node', [
      path.join(__dirname, '../../src/cli.js'),
      '--db-path', dbPath,
      'echo "test"'
    ]);

    await new Promise((resolve) => {
      wrapper.on('exit', resolve);
    });

    // Check database exists
    const stats = await fs.stat(dbPath);
    expect(stats.isFile()).toBe(true);

    // Cleanup
    await fs.unlink(dbPath);
  });
});
```

### 2. SDK Integration Test

Create `test/integration/sdk-integration.test.js`:

```javascript
const { createWrappedSDK } = require('../../src/sdk');

describe('SDK Integration', () => {
  test('wrapped SDK processes queries', async () => {
    const { query, getMetrics, shutdown } = createWrappedSDK({
      pluginDirectory: path.join(__dirname, '../../examples/plugins'),
      enabledPlugins: ['query-collector']
    });

    const messages = [];
    for await (const message of query('What is 2+2?')) {
      messages.push(message);
    }

    expect(messages.length).toBeGreaterThan(0);
    
    const metrics = await getMetrics();
    expect(metrics.eventBus.totalEvents).toBeGreaterThan(0);

    await shutdown();
  });
});
```

## Manual Testing

### Quick Test Script

Create `test/manual/quick-test.js`:

```javascript
#!/usr/bin/env node

const { ClaudeWrapper } = require('../src/wrapper');
const { Readable, Writable } = require('stream');

async function quickTest() {
  console.log('🧪 Claudeware Quick Test\n');

  const config = {
    mode: 'development',
    claudePath: 'echo', // Use echo for testing
    plugins: {
      directory: './examples/plugins',
      enabledPlugins: ['query-collector']
    },
    database: {
      path: ':memory:' // In-memory database
    }
  };

  const wrapper = new ClaudeWrapper(config);

  // Create test streams
  const stdin = new Readable({ read() {} });
  const stdout = new Writable({
    write(chunk, encoding, callback) {
      console.log('Output:', chunk.toString());
      callback();
    }
  });
  const stderr = new Writable({
    write(chunk, encoding, callback) {
      console.error('Error:', chunk.toString());
      callback();
    }
  });

  try {
    // Start wrapper
    await wrapper.start(['Hello Claude!'], stdin, stdout, stderr);
    
    // Get metrics
    const metrics = wrapper.getMetrics();
    console.log('\n📊 Metrics:', metrics);

    // Shutdown
    await wrapper.shutdown();
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

quickTest();
```

Run with:
```bash
node test/manual/quick-test.js
```

### Interactive Test

Create `test/manual/interactive-test.sh`:

```bash
#!/bin/bash

echo "🧪 Claudeware Interactive Test"
echo "======================================"
echo

# Test 1: Basic functionality
echo "Test 1: Basic query"
./claudeware "What is 2+2?"
echo

# Test 2: Plugin loading
echo "Test 2: Check plugins"
ls -la ~/.claude-code/plugins/
echo

# Test 3: Database creation
echo "Test 3: Check database"
sqlite3 ~/.claude-code/queries.db "SELECT COUNT(*) as queries FROM queries;"
echo

# Test 4: With environment variables
echo "Test 4: Debug mode"
CLAUDE_WRAPPER_LOG_LEVEL=debug ./claudeware "test debug"
echo

echo "✅ Interactive tests completed"
```

## Plugin Testing

### Test Individual Plugins

Create `test/manual/test-plugins.js`:

```javascript
const { PluginLoader } = require('../src/plugins/plugin-loader');
const { EventBus } = require('../src/plugins/event-bus');
const { SqliteAdapter } = require('../src/database/sqlite-adapter');
const winston = require('winston');

async function testPlugin(pluginPath) {
  console.log(`\n🔌 Testing plugin: ${pluginPath}`);
  
  // Create context
  const eventBus = new EventBus();
  const dataStore = new SqliteAdapter({ path: ':memory:' });
  await dataStore.init();
  
  const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
  });

  const context = {
    eventBus,
    dataStore,
    logger,
    config: {},
    sharedState: new Map()
  };

  const loader = new PluginLoader(context);

  try {
    // Load single plugin
    const Plugin = require(pluginPath);
    const plugin = new Plugin();
    
    // Initialize
    await plugin.initialize(context);
    console.log('✅ Plugin initialized');

    // Test with mock event
    const testEvent = {
      id: 'test-123',
      type: 'query',
      timestamp: Date.now(),
      data: {
        messages: [{ content: 'Test query' }]
      },
      metadata: {
        sessionId: 'test-session'
      }
    };

    await plugin.onEvent(testEvent, context);
    console.log('✅ Event processed');

    // Shutdown
    await plugin.shutdown();
    console.log('✅ Plugin shutdown');

  } catch (error) {
    console.error('❌ Plugin test failed:', error);
  } finally {
    await dataStore.close();
  }
}

// Test all example plugins
async function testAllPlugins() {
  const plugins = [
    '../../examples/plugins/token-monitor',
    '../../examples/plugins/cache',
    '../../examples/plugins/rate-limiter',
    '../../examples/plugins/analytics-dashboard'
  ];

  for (const plugin of plugins) {
    await testPlugin(plugin);
  }
}

testAllPlugins();
```

## End-to-End Testing

### Full System Test

Create `test/e2e/full-system.test.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 Claudeware E2E Test"
echo "================================"

# Setup
echo "📦 Setting up test environment..."
export CLAUDE_WRAPPER_TEST_MODE=true
export CLAUDE_WRAPPER_DB_PATH="./test-e2e.db"
export CLAUDE_WRAPPER_PLUGINS_DIR="./examples/plugins"

# Clean previous test
rm -f $CLAUDE_WRAPPER_DB_PATH

# Test 1: CLI with plugins
echo -e "\n📝 Test 1: CLI with query collection"
./claudeware --enable-plugins query-collector,token-monitor "Explain recursion"

# Test 2: Check database
echo -e "\n📊 Test 2: Verify data collection"
sqlite3 $CLAUDE_WRAPPER_DB_PATH <<EOF
SELECT 'Queries:', COUNT(*) FROM queries;
SELECT 'Categories:', category, COUNT(*) as count FROM queries GROUP BY category;
EOF

# Test 3: SDK integration
echo -e "\n🔧 Test 3: SDK integration"
node -e "
const { createWrappedSDK } = require('./src/sdk');
(async () => {
  const { query, getMetrics, shutdown } = createWrappedSDK();
  
  for await (const msg of query('Hello SDK!')) {
    if (msg.type === 'assistant') console.log('Response:', msg.content.substring(0, 50) + '...');
  }
  
  const metrics = await getMetrics();
  console.log('Metrics:', metrics);
  
  await shutdown();
})();
"

# Test 4: Plugin communication
echo -e "\n🔌 Test 4: Plugin communication"
./claudeware --enable-plugins cache,rate-limiter "What is AI?"
./claudeware --enable-plugins cache,rate-limiter "What is AI?" # Should hit cache

# Test 5: Analytics dashboard
echo -e "\n📈 Test 5: Analytics dashboard"
./claudeware --enable-plugins analytics-dashboard --no-wait "Start dashboard test" &
DASHBOARD_PID=$!
sleep 2

# Check if dashboard is running
curl -s http://localhost:3333/ > /dev/null && echo "✅ Dashboard is running" || echo "❌ Dashboard failed to start"

kill $DASHBOARD_PID 2>/dev/null || true

# Cleanup
echo -e "\n🧹 Cleaning up..."
rm -f $CLAUDE_WRAPPER_DB_PATH

echo -e "\n✅ E2E tests completed successfully!"
```

## Performance Testing

### Latency Test

Create `test/performance/latency-test.js`:

```javascript
const { ClaudeWrapper } = require('../src/wrapper');
const { PassThrough } = require('stream');

async function measureLatency() {
  console.log('⏱️  Measuring wrapper latency...\n');

  const config = {
    mode: 'production',
    claudePath: 'node',
    claudeArgs: ['-e', 'console.log(JSON.stringify({type:"response",content:"test"}))'],
    plugins: {
      enabledPlugins: [] // No plugins for baseline
    }
  };

  const iterations = 100;
  const latencies = [];

  for (let i = 0; i < iterations; i++) {
    const wrapper = new ClaudeWrapper(config);
    const stdout = new PassThrough();
    
    const start = process.hrtime.bigint();
    let firstByte = null;

    stdout.on('data', () => {
      if (!firstByte) {
        firstByte = process.hrtime.bigint();
        const latency = Number(firstByte - start) / 1000000; // Convert to ms
        latencies.push(latency);
      }
    });

    await wrapper.start([], new PassThrough(), stdout, new PassThrough());
    await wrapper.shutdown();
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const avg = latencies.reduce((a, b) => a + b) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log('📊 Latency Results:');
  console.log(`Average: ${avg.toFixed(2)}ms`);
  console.log(`P50: ${p50.toFixed(2)}ms`);
  console.log(`P95: ${p95.toFixed(2)}ms`);
  console.log(`P99: ${p99.toFixed(2)}ms`);
  console.log(`Min: ${latencies[0].toFixed(2)}ms`);
  console.log(`Max: ${latencies[latencies.length - 1].toFixed(2)}ms`);

  if (avg < 5) {
    console.log('\n✅ Excellent! Near-zero latency achieved');
  } else if (avg < 10) {
    console.log('\n✅ Good! Low latency maintained');
  } else {
    console.log('\n⚠️  Warning: Higher than expected latency');
  }
}

measureLatency();
```

## Running All Tests

Create `test/run-all-tests.sh`:

```bash
#!/bin/bash

echo "🧪 Running all Claudeware tests"
echo "========================================"

# Unit tests
echo -e "\n1️⃣ Running unit tests..."
npm test

# Integration tests
echo -e "\n2️⃣ Running integration tests..."
npm run test:integration

# Manual tests
echo -e "\n3️⃣ Running manual tests..."
node test/manual/quick-test.js

# Plugin tests
echo -e "\n4️⃣ Testing plugins..."
node test/manual/test-plugins.js

# Performance tests
echo -e "\n5️⃣ Running performance tests..."
node test/performance/latency-test.js

# E2E tests
echo -e "\n6️⃣ Running E2E tests..."
bash test/e2e/full-system.test.sh

echo -e "\n✅ All tests completed!"
```

Make it executable:
```bash
chmod +x test/run-all-tests.sh
./test/run-all-tests.sh
```

## Debugging Tests

### Enable Debug Logging

```bash
# Debug all components
DEBUG=claude-wrapper:* npm test

# Debug specific component
DEBUG=claude-wrapper:plugins npm test

# Maximum verbosity
CLAUDE_WRAPPER_LOG_LEVEL=debug npm test
```

### Test Single Component

```javascript
// test/debug/test-component.js
const { JsonStreamParser } = require('../src/core/json-parser');

const parser = new JsonStreamParser();
console.log(parser.parse('{"test": true}'));
```

## Continuous Testing

### Watch Mode Development

```json
// package.json scripts
{
  "dev": "nodemon --watch src --exec 'npm test'",
  "dev:integration": "nodemon --watch src --exec 'npm run test:integration'"
}
```

### Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
npm test
```

---

This testing guide ensures the Claudeware is thoroughly tested at all levels!