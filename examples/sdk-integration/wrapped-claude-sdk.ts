/**
 * Example: Using Claude Code SDK with Claudeware
 * 
 * This example demonstrates how to wrap the Claude Code SDK with Claudeware
 * to collect queries, analyze usage patterns, and get optimization suggestions.
 */

import { claude } from '@instantlyeasy/claude-code-sdk-ts';
import { createWrappedSDK, PluginMetrics } from '@instantlyeasy/claudeware';
import * as path from 'path';
import * as fs from 'fs';

// Initialize the wrapped SDK with custom configuration
const wrappedClaude = createWrappedSDK({
  pluginDirectory: path.join(__dirname, '../plugins'),
  databasePath: path.join(__dirname, '../../.claude-code/wrapped-sdk-queries.db'),
  monitoring: {
    enabled: true,
    logLevel: 'info'
  }
});

// Example 1: Basic Text Query with Metrics Collection
async function basicTextQuery() {
  console.log('\n=== Example 1: Basic Text Query ===\n');
  
  try {
    // Use the wrapped SDK just like the regular SDK
    const result = await wrappedClaude()
      .withModel('sonnet')
      .query('Explain what a closure is in JavaScript in 2 sentences')
      .asText();
    
    console.log('Response:', result);
    
    // Get metrics for this session
    const metrics = await wrappedClaude.getMetrics();
    console.log('\nSession Metrics:', {
      totalQueries: metrics.sessionMetrics.totalQueries,
      totalTokens: metrics.sessionMetrics.totalTokens,
      averageLatency: metrics.sessionMetrics.averageLatency
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 2: Streaming with Tool Usage Monitoring
async function streamingWithTools() {
  console.log('\n=== Example 2: Streaming with Tool Usage ===\n');
  
  try {
    await wrappedClaude()
      .withModel('sonnet')
      .allowTools('Read', 'LS', 'Grep')
      .onToolUse((tool) => {
        console.log(`🔧 Tool used: ${tool.name}`);
      })
      .query('List all TypeScript files in the current directory and show me the first 10 lines of each')
      .stream(async (message) => {
        if (message.type === 'assistant') {
          for (const block of message.content) {
            if (block.type === 'text') {
              process.stdout.write(block.text);
            }
          }
        }
      });
    
    console.log('\n\n--- Stream completed ---');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 3: Complex Query with Performance Analysis
async function complexQueryAnalysis() {
  console.log('\n=== Example 3: Complex Query Analysis ===\n');
  
  try {
    const startTime = Date.now();
    
    const result = await wrappedClaude()
      .withModel('opus')
      .allowTools('Read', 'Write', 'Edit', 'Bash')
      .acceptEdits()
      .withTimeout(60000)
      .query(`Create a simple Express.js server with the following endpoints:
        1. GET /health - returns { status: 'ok' }
        2. GET /time - returns current time
        3. POST /echo - echoes back the request body
        
        Include error handling and proper TypeScript types.`)
      .asText();
    
    const duration = Date.now() - startTime;
    
    console.log('Task completed in:', duration, 'ms');
    console.log('\nResult summary:', result.substring(0, 200) + '...');
    
    // Get detailed metrics
    const metrics = await wrappedClaude.getMetrics();
    console.log('\nDetailed Metrics:', {
      pluginMetrics: metrics.pluginMetrics,
      databaseMetrics: metrics.databaseMetrics
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 4: Using Different Models with Fallback
async function modelFallbackExample() {
  console.log('\n=== Example 4: Model Fallback Pattern ===\n');
  
  const models = ['opus', 'sonnet'];
  const query = 'Write a haiku about TypeScript';
  
  for (const model of models) {
    try {
      console.log(`Trying model: ${model}`);
      
      const result = await wrappedClaude()
        .withModel(model)
        .withTimeout(15000)
        .query(query)
        .asText();
      
      console.log(`\nSuccess with ${model}:`);
      console.log(result);
      
      // Get optimization suggestions from plugins
      const metrics = await wrappedClaude.getMetrics();
      if (metrics.pluginMetrics && metrics.pluginMetrics.length > 0) {
        console.log('\nOptimization Suggestions:');
        metrics.pluginMetrics.forEach((plugin: PluginMetrics) => {
          if (plugin.metadata?.suggestions) {
            console.log(`- ${plugin.metadata.suggestions}`);
          }
        });
      }
      
      break; // Success, exit loop
    } catch (error) {
      console.error(`Failed with ${model}:`, error.message);
      if (model === models[models.length - 1]) {
        throw new Error('All models failed');
      }
    }
  }
}

// Example 5: Research Session with Context Building
class ResearchSession {
  private context: string[] = [];
  private sessionId: string;
  
  constructor() {
    this.sessionId = `research-${Date.now()}`;
  }
  
  async ask(question: string): Promise<string> {
    console.log(`\n📝 Question: ${question}`);
    
    // Build context from previous Q&A
    const contextStr = this.context.length > 0 
      ? `Previous context:\n${this.context.join('\n\n')}\n\n` 
      : '';
    
    try {
      const answer = await wrappedClaude()
        .withModel('sonnet')
        .query(`${contextStr}Question: ${question}`)
        .asText();
      
      // Store Q&A in context
      this.context.push(`Q: ${question}\nA: ${answer}`);
      
      return answer;
    } catch (error) {
      console.error('Research session error:', error);
      throw error;
    }
  }
  
  async getSessionMetrics() {
    const metrics = await wrappedClaude.getMetrics();
    return {
      sessionId: this.sessionId,
      totalQuestions: this.context.length,
      ...metrics.sessionMetrics
    };
  }
}

// Example 6: Export collected queries for analysis
async function exportCollectedData() {
  console.log('\n=== Example 6: Exporting Collected Data ===\n');
  
  try {
    // Get all metrics
    const metrics = await wrappedClaude.getMetrics();
    
    // Export to JSON file
    const exportData = {
      timestamp: new Date().toISOString(),
      sessionMetrics: metrics.sessionMetrics,
      pluginMetrics: metrics.pluginMetrics,
      databaseMetrics: metrics.databaseMetrics
    };
    
    const exportPath = path.join(__dirname, 'query-analysis.json');
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    
    console.log(`Data exported to: ${exportPath}`);
    console.log('\nSummary:');
    console.log(`- Total Queries: ${metrics.sessionMetrics.totalQueries}`);
    console.log(`- Total Tokens: ${metrics.sessionMetrics.totalTokens}`);
    console.log(`- Average Latency: ${metrics.sessionMetrics.averageLatency}ms`);
    
  } catch (error) {
    console.error('Export error:', error);
  }
}

// Main execution
async function main() {
  console.log('🚀 Claudeware SDK Integration Examples\n');
  
  // Run examples
  await basicTextQuery();
  await streamingWithTools();
  await complexQueryAnalysis();
  await modelFallbackExample();
  
  // Research session example
  console.log('\n=== Example 5: Research Session ===');
  const session = new ResearchSession();
  
  await session.ask('What is TypeScript?');
  await session.ask('What are its main benefits?');
  await session.ask('How does it compare to JavaScript?');
  
  const sessionMetrics = await session.getSessionMetrics();
  console.log('\nSession Metrics:', sessionMetrics);
  
  // Export all collected data
  await exportCollectedData();
  
  // Shutdown gracefully
  await wrappedClaude.shutdown();
  console.log('\n✅ All examples completed!');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { basicTextQuery, streamingWithTools, complexQueryAnalysis, modelFallbackExample, ResearchSession };