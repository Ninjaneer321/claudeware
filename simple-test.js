#!/usr/bin/env node

/**
 * Simple test to demonstrate the Claude Code Wrapper concept
 */

console.log('🧪 Claude Code Wrapper - Simple Concept Test\n');

// Test 1: Mock the wrapper components
console.log('Test 1: Component Tests');
console.log('─'.repeat(40));

// Test JSON Parser
const { JsonStreamParser } = require('./src/wrapper');
const parser = new JsonStreamParser();
const parsed = parser.parse('{"type":"response","content":"Hello!"}\n{"type":"query"}');
console.log('✓ JSON Parser:', parsed.length === 2 ? 'PASS' : 'FAIL');

// Test Event Bus
const { EventBus } = require('./src/wrapper');
const eventBus = new EventBus();
let eventReceived = false;
eventBus.on('test', () => { eventReceived = true; });
eventBus.emit('test');
console.log('✓ Event Bus:', eventReceived ? 'PASS' : 'FAIL');

// Test SDK
console.log('\nTest 2: SDK Integration');
console.log('─'.repeat(40));

const { createWrappedSDK } = require('./src/sdk');
const sdk = createWrappedSDK();

(async () => {
  let responseReceived = false;
  
  for await (const message of sdk.query('Test query')) {
    if (message.type === 'assistant') {
      responseReceived = true;
      console.log('✓ SDK Response:', message.content);
    }
  }
  
  const metrics = await sdk.getMetrics();
  console.log('✓ SDK Metrics:', JSON.stringify(metrics));
  
  await sdk.shutdown();
  console.log('✓ SDK Shutdown: Complete');
  
  // Test 3: Demonstrate zero-latency concept
  console.log('\nTest 3: Zero-Latency Stream Concept');
  console.log('─'.repeat(40));
  
  const { spawn } = require('child_process');
  const startTime = process.hrtime.bigint();
  
  // Simulate Claude command
  const child = spawn('node', ['-e', 'console.log("Direct output from Claude"); process.exit(0);']);
  
  // Direct passthrough (zero-latency)
  child.stdout.pipe(process.stdout);
  
  // Parallel processing (doesn't affect output speed)
  child.stdout.on('data', (chunk) => {
    // This happens in parallel, doesn't block the pipe above
    const processingTime = process.hrtime.bigint() - startTime;
    console.log(`\n✓ Parallel processing at ${Number(processingTime) / 1000000}ms`);
  });
  
  child.on('exit', () => {
    const totalTime = process.hrtime.bigint() - startTime;
    console.log(`✓ Total execution time: ${Number(totalTime) / 1000000}ms`);
    
    console.log('\n✅ All tests completed!');
    console.log('\nThe wrapper provides:');
    console.log('1. Zero-latency passthrough (output appears immediately)');
    console.log('2. Parallel data collection (doesn\'t slow down Claude)');
    console.log('3. Plugin system for extensibility');
    console.log('4. SDK integration for programmatic access');
  });
})();