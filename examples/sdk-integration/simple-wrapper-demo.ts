/**
 * Simple Claudeware Demo
 * 
 * Shows the key benefits of wrapping Claude Code SDK with Claudeware:
 * - Automatic query collection
 * - Token usage tracking
 * - Performance monitoring
 * - Plugin-based analysis
 */

import { createWrappedSDK } from '@timmytown/claudeware';

async function main() {
  // Create wrapped SDK instance
  const wrappedClaude = createWrappedSDK({
    // All queries are automatically stored here
    databasePath: './claude-queries.db'
  });

  console.log('🔍 Claudeware is now monitoring your Claude Code SDK usage\n');

  // Example 1: Simple query - automatically collected
  console.log('1️⃣ Making a simple query...');
  
  for await (const msg of wrappedClaude.query('What is 2 + 2?')) {
    if (msg.type === 'assistant' && msg.content) {
      const text = msg.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
      console.log('Answer:', text);
    }
  }

  // Example 2: Code generation - tracks token usage
  console.log('\n2️⃣ Generating code...');
  
  let codeText = '';
  for await (const msg of wrappedClaude.query(
    'Write a Python function to calculate factorial',
    { model: 'claude-3-sonnet-20240229' }
  )) {
    if (msg.type === 'assistant' && msg.content) {
      const text = msg.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
      codeText += text;
    }
  }
  console.log('Generated code preview:', codeText.substring(0, 100) + '...');

  // Example 3: Using with tools
  console.log('\n3️⃣ Tool usage example...');
  console.log('Using tools to explore the current directory:\n');
  
  for await (const msg of wrappedClaude.query(
    'List all JSON files in the current directory',
    { tools: ['Read', 'LS'] }
  )) {
    if (msg.type === 'assistant' && msg.content) {
      msg.content.forEach((block: any) => {
        if (block.type === 'text') {
          process.stdout.write(block.text);
        }
      });
    }
  }

  // View collected metrics
  console.log('\n\n📊 Session Metrics:');
  const metrics = await wrappedClaude.getMetrics();
  
  console.log(`- Events Processed: ${metrics.eventBus.totalEvents}`);
  console.log(`- Events in Queue: ${metrics.batchQueue.pending}`);
  
  // Plugin insights
  if (metrics.plugins?.length > 0) {
    console.log('\n💡 Plugin Metrics:');
    metrics.plugins.forEach((plugin: any) => {
      console.log(`- ${plugin.name}: ${plugin.eventsProcessed} events processed`);
    });
  }

  // All queries are automatically saved to the database
  console.log('\n✅ All queries have been automatically saved to:', './claude-queries.db');
  console.log('   You can analyze them later using SQL or export tools.');

  // Clean shutdown
  await wrappedClaude.shutdown();
}

// Benefits summary
console.log(`
🚀 Claudeware Benefits:
   ✓ Zero-latency monitoring (doesn't slow down responses)
   ✓ Automatic query/response storage
   ✓ Token usage tracking
   ✓ Performance metrics
   ✓ Plugin system for custom analysis
   ✓ Works with all Claude Code SDK features
`);

// Check if ANTHROPIC_API_KEY is set
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n⚠️  Please set ANTHROPIC_API_KEY environment variable to run this demo');
  console.error('   Example: export ANTHROPIC_API_KEY="your-api-key"');
  process.exit(1);
}

main().catch(console.error);