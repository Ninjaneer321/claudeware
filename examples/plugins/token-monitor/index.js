/**
 * Token Monitor Plugin
 * 
 * Monitors Claude Code token usage and sends alerts when thresholds are exceeded.
 * Tracks daily usage and provides warnings before limits are reached.
 */

class TokenMonitorPlugin {
  constructor() {
    this.name = 'token-monitor';
    this.version = '1.0.0';
    this.manifest = require('./manifest.json');
    
    // Token tracking
    this.dailyTokens = new Map(); // date -> token count
    this.sessionTokens = new Map(); // sessionId -> token count
    
    // Configuration
    this.dailyLimit = 100000;
    this.warningThreshold = 0.8;
    this.alertWebhook = null;
    
    // State
    this.lastAlertSent = null;
    this.logger = null;
  }

  async initialize(context) {
    this.logger = context.logger.child({ plugin: this.name });
    
    // Load configuration
    this.dailyLimit = context.config.dailyLimit || this.dailyLimit;
    this.warningThreshold = context.config.warningThreshold || this.warningThreshold;
    this.alertWebhook = context.config.alertWebhook;
    
    this.logger.info('Token monitor initialized', {
      dailyLimit: this.dailyLimit,
      warningThreshold: this.warningThreshold,
      alertsEnabled: !!this.alertWebhook
    });
    
    // Load today's usage from database
    await this.loadTodayUsage(context);
    
    // Reset daily counters at midnight
    this.scheduleReset();
  }

  async onEvent(event, context) {
    try {
      if (event.type === 'response' && event.data.usage) {
        await this.trackTokenUsage(event, context);
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error processing event');
    }
  }

  async trackTokenUsage(event, context) {
    const usage = event.data.usage;
    const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
    const sessionId = event.metadata.sessionId;
    const today = new Date().toISOString().split('T')[0];
    
    // Update daily total
    const currentDaily = this.dailyTokens.get(today) || 0;
    const newDaily = currentDaily + totalTokens;
    this.dailyTokens.set(today, newDaily);
    
    // Update session total
    const currentSession = this.sessionTokens.get(sessionId) || 0;
    this.sessionTokens.set(sessionId, currentSession + totalTokens);
    
    // Log usage
    this.logger.debug('Token usage tracked', {
      tokens: totalTokens,
      dailyTotal: newDaily,
      sessionTotal: currentSession + totalTokens
    });
    
    // Check thresholds
    await this.checkThresholds(newDaily, context);
    
    // Share metrics
    context.sharedState.set('token-monitor:daily', newDaily);
    context.sharedState.set('token-monitor:remaining', this.dailyLimit - newDaily);
    
    // Emit usage event
    context.eventBus.emit('token-usage', {
      daily: newDaily,
      session: currentSession + totalTokens,
      limit: this.dailyLimit,
      percentage: (newDaily / this.dailyLimit) * 100
    });
  }

  async checkThresholds(dailyTotal, context) {
    const percentage = dailyTotal / this.dailyLimit;
    
    // Check if we should send an alert
    if (percentage >= this.warningThreshold) {
      const shouldAlert = this.shouldSendAlert(percentage);
      
      if (shouldAlert) {
        await this.sendAlert(dailyTotal, percentage, context);
      }
    }
    
    // Log warnings
    if (percentage >= 0.9) {
      this.logger.warn('Daily token limit nearly exceeded', {
        used: dailyTotal,
        limit: this.dailyLimit,
        percentage: Math.round(percentage * 100)
      });
    } else if (percentage >= this.warningThreshold) {
      this.logger.info('Approaching daily token limit', {
        used: dailyTotal,
        limit: this.dailyLimit,
        percentage: Math.round(percentage * 100)
      });
    }
  }

  shouldSendAlert(percentage) {
    const now = Date.now();
    
    // Don't send alerts too frequently
    if (this.lastAlertSent && now - this.lastAlertSent < 3600000) { // 1 hour
      return false;
    }
    
    // Send alerts at 80%, 90%, 95%, 100%
    const thresholds = [0.8, 0.9, 0.95, 1.0];
    return thresholds.includes(Math.round(percentage * 20) / 20);
  }

  async sendAlert(dailyTotal, percentage, context) {
    const alert = {
      type: 'token_limit_warning',
      timestamp: new Date().toISOString(),
      usage: {
        daily: dailyTotal,
        limit: this.dailyLimit,
        percentage: Math.round(percentage * 100),
        remaining: Math.max(0, this.dailyLimit - dailyTotal)
      },
      message: percentage >= 1 
        ? 'Daily token limit exceeded!'
        : `Token usage at ${Math.round(percentage * 100)}% of daily limit`
    };
    
    // Log the alert
    this.logger.warn('Token limit alert', alert);
    
    // Send webhook if configured
    if (this.alertWebhook) {
      try {
        await this.sendWebhook(alert);
        this.lastAlertSent = Date.now();
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to send webhook alert');
      }
    }
    
    // Emit alert event
    context.eventBus.emit('token-alert', alert);
  }

  async sendWebhook(alert) {
    const response = await fetch(this.alertWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(alert)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  }

  async loadTodayUsage(context) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const startOfDay = new Date(today).getTime() / 1000;
      
      // Query today's usage from database
      const stats = await context.dataStore.getQueryStats({
        start: new Date(today),
        end: new Date()
      });
      
      if (stats && stats.totalTokens) {
        this.dailyTokens.set(today, stats.totalTokens);
        this.logger.info('Loaded today\'s usage', {
          date: today,
          tokens: stats.totalTokens
        });
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to load today\'s usage');
    }
  }

  scheduleReset() {
    // Calculate milliseconds until midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    // Schedule reset
    setTimeout(() => {
      this.resetDailyCounters();
      // Schedule next reset
      setInterval(() => this.resetDailyCounters(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
    
    this.logger.debug('Scheduled daily reset', {
      nextReset: tomorrow.toISOString()
    });
  }

  resetDailyCounters() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    
    // Log yesterday's final usage
    const yesterdayTotal = this.dailyTokens.get(yesterdayKey) || 0;
    if (yesterdayTotal > 0) {
      this.logger.info('Daily usage summary', {
        date: yesterdayKey,
        tokens: yesterdayTotal,
        percentage: Math.round((yesterdayTotal / this.dailyLimit) * 100)
      });
    }
    
    // Clear old data (keep last 7 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    
    for (const [date, _] of this.dailyTokens) {
      if (new Date(date) < cutoff) {
        this.dailyTokens.delete(date);
      }
    }
    
    // Reset alert flag
    this.lastAlertSent = null;
    
    this.logger.info('Daily counters reset');
  }

  async shutdown() {
    // Save current state
    const today = new Date().toISOString().split('T')[0];
    const todayTotal = this.dailyTokens.get(today) || 0;
    
    this.logger.info('Token monitor shutting down', {
      todayTotal,
      sessionsTracked: this.sessionTokens.size
    });
    
    // Clear timers
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
  }

  // Public API for other plugins
  getUsageStats() {
    const today = new Date().toISOString().split('T')[0];
    const dailyUsed = this.dailyTokens.get(today) || 0;
    
    return {
      daily: {
        used: dailyUsed,
        limit: this.dailyLimit,
        remaining: Math.max(0, this.dailyLimit - dailyUsed),
        percentage: Math.round((dailyUsed / this.dailyLimit) * 100)
      },
      sessions: Object.fromEntries(this.sessionTokens),
      history: Object.fromEntries(this.dailyTokens)
    };
  }
}

module.exports = TokenMonitorPlugin;