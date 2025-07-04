/**
 * Query Analysis Example
 * 
 * Shows how to analyze queries collected by Claudeware
 * to find optimization opportunities and usage patterns.
 */

import { createWrappedSDK } from '@instantlyeasy/claudeware';
import Database from 'better-sqlite3';
import * as path from 'path';

// Create wrapped SDK
const wrappedClaude = createWrappedSDK({
  databasePath: './claude-queries.db'
});

async function collectSampleQueries() {
  console.log('📝 Collecting sample queries...\n');

  // Various query types for analysis
  const queries = [
    { model: 'sonnet', query: 'What is 2 + 2?' },
    { model: 'sonnet', query: 'Explain closures in JavaScript' },
    { model: 'opus', query: 'Write a complete REST API with Express.js including authentication, error handling, and database integration' },
    { model: 'sonnet', query: 'What is the capital of France?' },
    { model: 'opus', query: 'Debug this code: const x = null; x.forEach(...)' },
    { model: 'sonnet', query: 'List benefits of TypeScript' },
  ];

  for (const { model, query } of queries) {
    console.log(`Running: "${query.substring(0, 50)}..."`);
    try {
      await wrappedClaude()
        .withModel(model)
        .query(query)
        .asText();
    } catch (error) {
      console.error(`Failed:`, error.message);
    }
  }

  console.log('\n✅ Sample queries collected!\n');
}

async function analyzeQueries() {
  console.log('🔍 Analyzing collected queries...\n');

  // Open the database directly for analysis
  const db = new Database('./claude-queries.db', { readonly: true });

  try {
    // 1. Query Statistics
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_queries,
        COUNT(DISTINCT session_id) as total_sessions,
        AVG(token_count) as avg_tokens,
        SUM(token_count) as total_tokens,
        AVG(latency) as avg_latency_ms
      FROM queries
    `).get();

    console.log('📊 Overall Statistics:');
    console.log(`- Total Queries: ${stats.total_queries}`);
    console.log(`- Total Sessions: ${stats.total_sessions}`);
    console.log(`- Average Tokens per Query: ${Math.round(stats.avg_tokens)}`);
    console.log(`- Total Tokens Used: ${stats.total_tokens}`);
    console.log(`- Average Response Time: ${Math.round(stats.avg_latency_ms)}ms`);

    // 2. Model Usage
    console.log('\n🤖 Model Usage:');
    const modelUsage = db.prepare(`
      SELECT 
        model,
        COUNT(*) as query_count,
        AVG(token_count) as avg_tokens,
        AVG(latency) as avg_latency
      FROM queries
      GROUP BY model
      ORDER BY query_count DESC
    `).all();

    modelUsage.forEach(row => {
      console.log(`- ${row.model}: ${row.query_count} queries, ~${Math.round(row.avg_tokens)} tokens avg, ~${Math.round(row.avg_latency)}ms`);
    });

    // 3. Query Categories (if query-collector plugin is active)
    console.log('\n📂 Query Categories:');
    const categories = db.prepare(`
      SELECT 
        json_extract(metadata, '$.category') as category,
        COUNT(*) as count,
        AVG(token_count) as avg_tokens
      FROM queries
      WHERE json_extract(metadata, '$.category') IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all();

    if (categories.length > 0) {
      categories.forEach(row => {
        console.log(`- ${row.category}: ${row.count} queries, ~${Math.round(row.avg_tokens)} tokens avg`);
      });
    } else {
      console.log('- No categories found (query-collector plugin may not be active)');
    }

    // 4. Cost Analysis
    console.log('\n💰 Estimated Cost Analysis:');
    const costAnalysis = db.prepare(`
      SELECT 
        model,
        SUM(token_count) as total_tokens,
        COUNT(*) as query_count
      FROM queries
      GROUP BY model
    `).all();

    // Rough token pricing (adjust based on actual pricing)
    const tokenPricing = {
      opus: { input: 0.015, output: 0.075 }, // per 1K tokens
      sonnet: { input: 0.003, output: 0.015 }
    };

    let totalCost = 0;
    costAnalysis.forEach(row => {
      const pricing = tokenPricing[row.model] || tokenPricing.sonnet;
      // Rough estimate: assume 30% input, 70% output
      const inputTokens = row.total_tokens * 0.3;
      const outputTokens = row.total_tokens * 0.7;
      const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
      totalCost += cost;
      console.log(`- ${row.model}: $${cost.toFixed(4)} (${row.total_tokens} tokens)`);
    });
    console.log(`- Total Estimated Cost: $${totalCost.toFixed(4)}`);

    // 5. Optimization Opportunities
    console.log('\n💡 Optimization Opportunities:');
    
    // Find simple queries using expensive models
    const overspecced = db.prepare(`
      SELECT 
        query_text,
        model,
        token_count
      FROM queries
      WHERE model = 'opus' 
        AND token_count < 100
        AND query_text NOT LIKE '%code%'
        AND query_text NOT LIKE '%implement%'
        AND query_text NOT LIKE '%create%'
      LIMIT 5
    `).all();

    if (overspecced.length > 0) {
      console.log('\n⚠️  Simple queries using Opus (consider using Sonnet):');
      overspecced.forEach(row => {
        console.log(`   - "${row.query_text.substring(0, 50)}..." (${row.token_count} tokens)`);
      });
    }

    // Find duplicate/similar queries
    const duplicates = db.prepare(`
      SELECT 
        query_text,
        COUNT(*) as count,
        SUM(token_count) as total_tokens
      FROM queries
      GROUP BY query_text
      HAVING count > 1
      ORDER BY total_tokens DESC
      LIMIT 5
    `).all();

    if (duplicates.length > 0) {
      console.log('\n🔄 Duplicate queries (consider caching):');
      duplicates.forEach(row => {
        console.log(`   - "${row.query_text.substring(0, 50)}..." × ${row.count} (${row.total_tokens} tokens total)`);
      });
    }

    // 6. Time-based patterns
    console.log('\n⏰ Usage Patterns:');
    const timePatterns = db.prepare(`
      SELECT 
        strftime('%H', timestamp) as hour,
        COUNT(*) as query_count,
        AVG(latency) as avg_latency
      FROM queries
      GROUP BY hour
      ORDER BY hour
    `).all();

    const activeHours = timePatterns.filter(row => row.query_count > 0);
    if (activeHours.length > 0) {
      console.log('Most active hours:');
      activeHours
        .sort((a, b) => b.query_count - a.query_count)
        .slice(0, 3)
        .forEach(row => {
          console.log(`   - ${row.hour}:00: ${row.query_count} queries`);
        });
    }

  } finally {
    db.close();
  }
}

// Main execution
async function main() {
  console.log('🚀 Claudeware Query Analysis Demo\n');

  // First, collect some sample queries
  await collectSampleQueries();

  // Then analyze them
  await analyzeQueries();

  // Get real-time metrics from the wrapper
  console.log('\n📈 Real-time Session Metrics:');
  const metrics = await wrappedClaude.getMetrics();
  console.log(metrics.sessionMetrics);

  // Shutdown
  await wrappedClaude.shutdown();
  console.log('\n✅ Analysis complete!');
}

// Export individual functions for reuse
export { collectSampleQueries, analyzeQueries };

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}