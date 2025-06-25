/**
 * Analytics Dashboard Plugin
 * 
 * Provides real-time analytics and insights via a web dashboard.
 * Tracks usage patterns, costs, and performance metrics.
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

class AnalyticsDashboardPlugin {
  constructor() {
    this.name = 'analytics-dashboard';
    this.version = '1.0.0';
    this.manifest = require('./manifest.json');
    
    // Analytics data
    this.stats = {
      queries: {
        total: 0,
        today: 0,
        byCategory: {},
        byModel: {},
        byHour: new Array(24).fill(0)
      },
      tokens: {
        totalInput: 0,
        totalOutput: 0,
        todayInput: 0,
        todayOutput: 0
      },
      performance: {
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        latencies: []
      },
      errors: {
        total: 0,
        byType: {}
      },
      costs: {
        total: 0,
        today: 0,
        byModel: {}
      }
    };
    
    // Time series data
    this.timeSeries = {
      queries: [], // { timestamp, count }
      tokens: [], // { timestamp, input, output }
      latency: [] // { timestamp, value }
    };
    
    // Configuration
    this.port = 3333;
    this.host = 'localhost';
    this.updateInterval = 5000;
    this.retentionDays = 30;
    this.enableWebSocket = true;
    
    // State
    this.server = null;
    this.clients = new Set();
    this.todayStart = this.getStartOfDay();
  }

  async initialize(context) {
    this.logger = context.logger.child({ plugin: this.name });
    this.dataStore = context.dataStore;
    this.sharedState = context.sharedState;
    
    // Load configuration
    this.port = context.config.port || this.port;
    this.host = context.config.host || this.host;
    this.updateInterval = context.config.updateInterval || this.updateInterval;
    this.retentionDays = context.config.retentionDays || this.retentionDays;
    this.enableWebSocket = context.config.enableWebSocket !== false;
    
    this.logger.info('Analytics dashboard initializing', {
      port: this.port,
      host: this.host,
      updateInterval: this.updateInterval
    });
    
    // Load historical data
    await this.loadHistoricalData();
    
    // Start web server
    await this.startServer();
    
    // Schedule updates
    this.startUpdateLoop();
    
    // Reset daily stats at midnight
    this.scheduleDailyReset();
  }

  async onEvent(event, context) {
    try {
      const now = Date.now();
      
      switch (event.type) {
        case 'query':
          await this.handleQuery(event);
          break;
        case 'response':
          await this.handleResponse(event);
          break;
        case 'error':
          await this.handleError(event);
          break;
      }
      
      // Broadcast updates if WebSocket is enabled
      if (this.enableWebSocket && this.clients.size > 0) {
        this.broadcastUpdate('event', {
          type: event.type,
          timestamp: now
        });
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error processing event');
    }
  }

  async handleQuery(event) {
    this.stats.queries.total++;
    this.stats.queries.today++;
    
    // Track by hour
    const hour = new Date().getHours();
    this.stats.queries.byHour[hour]++;
    
    // Track by category
    const category = event.data.category || 'uncategorized';
    this.stats.queries.byCategory[category] = (this.stats.queries.byCategory[category] || 0) + 1;
    
    // Track by model
    const model = event.data.model || 'unknown';
    this.stats.queries.byModel[model] = (this.stats.queries.byModel[model] || 0) + 1;
    
    // Add to time series
    this.addToTimeSeries('queries', {
      timestamp: Date.now(),
      count: 1
    });
  }

  async handleResponse(event) {
    const usage = event.data.usage;
    if (!usage) return;
    
    // Update token counts
    this.stats.tokens.totalInput += usage.input_tokens || 0;
    this.stats.tokens.totalOutput += usage.output_tokens || 0;
    this.stats.tokens.todayInput += usage.input_tokens || 0;
    this.stats.tokens.todayOutput += usage.output_tokens || 0;
    
    // Update latency
    if (event.metadata.latencyMs) {
      this.updateLatencyStats(event.metadata.latencyMs);
    }
    
    // Calculate costs (example rates)
    const costs = this.calculateCosts(usage, event.data.model);
    this.stats.costs.total += costs.total;
    this.stats.costs.today += costs.total;
    
    const model = event.data.model || 'unknown';
    this.stats.costs.byModel[model] = (this.stats.costs.byModel[model] || 0) + costs.total;
    
    // Add to time series
    this.addToTimeSeries('tokens', {
      timestamp: Date.now(),
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0
    });
  }

  async handleError(event) {
    this.stats.errors.total++;
    
    const errorType = event.data.error || 'unknown';
    this.stats.errors.byType[errorType] = (this.stats.errors.byType[errorType] || 0) + 1;
  }

  updateLatencyStats(latency) {
    this.stats.performance.latencies.push(latency);
    
    // Keep only last 1000 latencies
    if (this.stats.performance.latencies.length > 1000) {
      this.stats.performance.latencies.shift();
    }
    
    // Calculate percentiles
    const sorted = [...this.stats.performance.latencies].sort((a, b) => a - b);
    const len = sorted.length;
    
    this.stats.performance.avgLatency = sorted.reduce((a, b) => a + b, 0) / len;
    this.stats.performance.p95Latency = sorted[Math.floor(len * 0.95)];
    this.stats.performance.p99Latency = sorted[Math.floor(len * 0.99)];
    
    // Add to time series
    this.addToTimeSeries('latency', {
      timestamp: Date.now(),
      value: latency
    });
  }

  calculateCosts(usage, model) {
    // Example pricing (adjust to actual rates)
    const rates = {
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 }
    };
    
    const modelRates = rates[model] || rates['claude-3-haiku'];
    const inputCost = (usage.input_tokens / 1000) * modelRates.input;
    const outputCost = (usage.output_tokens / 1000) * modelRates.output;
    
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost
    };
  }

  addToTimeSeries(series, data) {
    const list = this.timeSeries[series];
    list.push(data);
    
    // Trim old data
    const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    this.timeSeries[series] = list.filter(item => item.timestamp > cutoff);
  }

  async loadHistoricalData() {
    try {
      const stats = await this.dataStore.getQueryStats({
        start: new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000),
        end: new Date()
      });
      
      if (stats) {
        // Merge historical data
        this.logger.info('Loaded historical analytics data');
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to load historical data');
    }
  }

  async startServer() {
    this.server = http.createServer(async (req, res) => {
      try {
        if (req.url === '/') {
          await this.serveDashboard(res);
        } else if (req.url === '/api/stats') {
          await this.serveStats(res);
        } else if (req.url === '/api/timeseries') {
          await this.serveTimeSeries(res);
        } else if (req.url === '/ws' && this.enableWebSocket) {
          this.handleWebSocket(req, res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      } catch (error) {
        this.logger.error({ error: error.message }, 'Server error');
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    
    await new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    this.logger.info(`Analytics dashboard running at http://${this.host}:${this.port}`);
    
    // Share dashboard URL
    this.sharedState.set('analytics:url', `http://${this.host}:${this.port}`);
  }

  async serveDashboard(res) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Claude Code Analytics</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric {
      font-size: 36px;
      font-weight: bold;
      color: #2563eb;
      margin: 10px 0;
    }
    .label {
      color: #666;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .chart {
      height: 200px;
      margin-top: 20px;
    }
    .status {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10b981;
      margin-right: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      text-align: left;
      padding: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      font-weight: 600;
      color: #374151;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Claude Code Analytics Dashboard</h1>
    
    <div class="grid">
      <div class="card">
        <div class="label">Total Queries</div>
        <div class="metric" id="total-queries">-</div>
        <div class="label">Today: <span id="today-queries">-</span></div>
      </div>
      
      <div class="card">
        <div class="label">Total Tokens</div>
        <div class="metric" id="total-tokens">-</div>
        <div class="label">Today: <span id="today-tokens">-</span></div>
      </div>
      
      <div class="card">
        <div class="label">Total Cost</div>
        <div class="metric" id="total-cost">-</div>
        <div class="label">Today: <span id="today-cost">-</span></div>
      </div>
      
      <div class="card">
        <div class="label">Avg Latency</div>
        <div class="metric" id="avg-latency">-</div>
        <div class="label">P95: <span id="p95-latency">-</span>ms</div>
      </div>
    </div>
    
    <div class="grid">
      <div class="card">
        <h3>Queries by Category</h3>
        <table id="category-table">
          <thead>
            <tr><th>Category</th><th>Count</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      
      <div class="card">
        <h3>Queries by Model</h3>
        <table id="model-table">
          <thead>
            <tr><th>Model</th><th>Count</th><th>Cost</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      
      <div class="card">
        <h3>Errors</h3>
        <div class="metric" style="color: #ef4444;" id="total-errors">-</div>
        <table id="error-table">
          <thead>
            <tr><th>Type</th><th>Count</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
    
    <div class="card">
      <h3>Activity Timeline</h3>
      <canvas id="timeline-chart" class="chart"></canvas>
    </div>
    
    <div style="margin-top: 20px; text-align: center; color: #666;">
      <span class="status"></span> Live Updates ${this.enableWebSocket ? 'Enabled' : 'Disabled'}
      | Refreshing every ${this.updateInterval / 1000}s
    </div>
  </div>
  
  <script>
    // Fetch and update stats
    async function updateStats() {
      try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        
        // Update metrics
        document.getElementById('total-queries').textContent = stats.queries.total.toLocaleString();
        document.getElementById('today-queries').textContent = stats.queries.today.toLocaleString();
        
        const totalTokens = stats.tokens.totalInput + stats.tokens.totalOutput;
        const todayTokens = stats.tokens.todayInput + stats.tokens.todayOutput;
        document.getElementById('total-tokens').textContent = totalTokens.toLocaleString();
        document.getElementById('today-tokens').textContent = todayTokens.toLocaleString();
        
        document.getElementById('total-cost').textContent = '$' + stats.costs.total.toFixed(2);
        document.getElementById('today-cost').textContent = '$' + stats.costs.today.toFixed(2);
        
        document.getElementById('avg-latency').textContent = Math.round(stats.performance.avgLatency) + 'ms';
        document.getElementById('p95-latency').textContent = Math.round(stats.performance.p95Latency);
        
        document.getElementById('total-errors').textContent = stats.errors.total.toLocaleString();
        
        // Update tables
        updateTable('category-table', Object.entries(stats.queries.byCategory).map(([k,v]) => [k,v]));
        updateTable('model-table', Object.entries(stats.queries.byModel).map(([k,v]) => [k, v, '$' + (stats.costs.byModel[k] || 0).toFixed(2)]));
        updateTable('error-table', Object.entries(stats.errors.byType).map(([k,v]) => [k,v]));
        
      } catch (error) {
        console.error('Failed to update stats:', error);
      }
    }
    
    function updateTable(tableId, data) {
      const tbody = document.querySelector('#' + tableId + ' tbody');
      tbody.innerHTML = data.map(row => 
        '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>'
      ).join('');
    }
    
    // Initial load and periodic updates
    updateStats();
    setInterval(updateStats, ${this.updateInterval});
    
    ${this.enableWebSocket ? `
    // WebSocket for real-time updates
    const ws = new WebSocket('ws://${this.host}:${this.port}/ws');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'stats-update') {
        updateStats();
      }
    };
    ` : ''}
  </script>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  async serveStats(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(this.stats));
  }

  async serveTimeSeries(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(this.timeSeries));
  }

  handleWebSocket(req, res) {
    // Simple WebSocket implementation (production should use ws library)
    this.logger.debug('WebSocket connection requested');
    res.writeHead(501);
    res.end('WebSocket support requires ws library');
  }

  startUpdateLoop() {
    setInterval(() => {
      this.broadcastUpdate('stats-update', this.stats);
    }, this.updateInterval);
  }

  broadcastUpdate(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    this.clients.forEach(client => {
      try {
        client.send(message);
      } catch (error) {
        this.clients.delete(client);
      }
    });
  }

  getStartOfDay() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  scheduleDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetDailyStats();
      // Schedule next reset
      setInterval(() => this.resetDailyStats(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  resetDailyStats() {
    this.stats.queries.today = 0;
    this.stats.tokens.todayInput = 0;
    this.stats.tokens.todayOutput = 0;
    this.stats.costs.today = 0;
    this.todayStart = this.getStartOfDay();
    
    this.logger.info('Daily stats reset');
  }

  async shutdown() {
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
    
    this.logger.info('Analytics dashboard shut down', {
      totalQueries: this.stats.queries.total,
      totalCost: this.stats.costs.total
    });
  }
}

module.exports = AnalyticsDashboardPlugin;