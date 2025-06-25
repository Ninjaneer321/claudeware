/**
 * Rate Limiter Plugin
 * 
 * Prevents hitting API rate limits by throttling requests.
 * Supports multiple time windows and queuing of excess requests.
 */

class RateLimiterPlugin {
  constructor() {
    this.name = 'rate-limiter';
    this.version = '1.0.0';
    this.manifest = require('./manifest.json');
    
    // Rate tracking
    this.windows = {
      minute: { requests: [], limit: 10 },
      hour: { requests: [], limit: 100 },
      day: { requests: [], limit: 1000 }
    };
    
    // Configuration
    this.strategy = 'sliding';
    this.queueEnabled = true;
    this.queueSize = 50;
    this.burstSize = 5;
    
    // State
    this.queue = [];
    this.processing = false;
    this.metrics = {
      allowed: 0,
      blocked: 0,
      queued: 0,
      dropped: 0
    };
  }

  async initialize(context) {
    this.logger = context.logger.child({ plugin: this.name });
    this.eventBus = context.eventBus;
    
    // Load configuration
    const limits = context.config.limits || {};
    this.windows.minute.limit = limits.perMinute || this.windows.minute.limit;
    this.windows.hour.limit = limits.perHour || this.windows.hour.limit;
    this.windows.day.limit = limits.perDay || this.windows.day.limit;
    
    this.strategy = context.config.strategy || this.strategy;
    this.queueEnabled = context.config.queueEnabled !== false;
    this.queueSize = context.config.queueSize || this.queueSize;
    this.burstSize = context.config.burstSize || this.burstSize;
    
    this.logger.info('Rate limiter initialized', {
      limits: {
        perMinute: this.windows.minute.limit,
        perHour: this.windows.hour.limit,
        perDay: this.windows.day.limit
      },
      strategy: this.strategy,
      queueEnabled: this.queueEnabled
    });
    
    // Set up queue processor
    if (this.queueEnabled) {
      this.startQueueProcessor();
    }
    
    // Share initial status
    this.updateSharedState(context);
  }

  async onEvent(event, context) {
    try {
      if (event.type === 'query') {
        await this.handleQuery(event, context);
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error processing event');
    }
  }

  async handleQuery(event, context) {
    const now = Date.now();
    
    // Clean old requests from windows
    this.cleanWindows(now);
    
    // Check if request is allowed
    const allowed = this.isRequestAllowed(now);
    
    if (allowed) {
      // Track the request
      this.trackRequest(now);
      this.metrics.allowed++;
      
      this.logger.debug('Request allowed', {
        windows: this.getWindowStatus()
      });
      
      // Let it through
      this.updateSharedState(context);
      
    } else {
      // Rate limited
      this.metrics.blocked++;
      
      if (this.queueEnabled && this.queue.length < this.queueSize) {
        // Queue the request
        this.queue.push({
          event,
          timestamp: now,
          context
        });
        this.metrics.queued++;
        
        this.logger.info('Request queued', {
          queueSize: this.queue.length,
          windows: this.getWindowStatus()
        });
        
        // Emit rate limit event
        context.eventBus.emit('rate-limited', {
          queryId: event.id,
          queued: true,
          queuePosition: this.queue.length,
          retryAfter: this.getRetryAfter()
        });
        
      } else {
        // Drop the request
        this.metrics.dropped++;
        
        this.logger.warn('Request dropped - rate limit exceeded', {
          queueFull: this.queueEnabled,
          windows: this.getWindowStatus()
        });
        
        // Emit rate limit event
        context.eventBus.emit('rate-limited', {
          queryId: event.id,
          queued: false,
          dropped: true,
          retryAfter: this.getRetryAfter()
        });
        
        // Emit error response
        const errorEvent = {
          id: event.id + '-error',
          type: 'error',
          timestamp: now,
          data: {
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please try again later.',
            retryAfter: this.getRetryAfter()
          },
          metadata: {
            ...event.metadata,
            rateLimited: true
          }
        };
        
        context.eventBus.emit('error', errorEvent);
      }
      
      this.updateSharedState(context);
    }
  }

  isRequestAllowed(now) {
    // Check burst allowance first
    const recentRequests = this.windows.minute.requests.length;
    if (recentRequests === 0) {
      // Allow burst at start
      return true;
    }
    
    // Check each window
    for (const [name, window] of Object.entries(this.windows)) {
      if (window.requests.length >= window.limit) {
        return false;
      }
    }
    
    // Check burst limit
    const lastMinute = this.windows.minute.requests.filter(
      t => now - t < 5000 // Last 5 seconds
    );
    if (lastMinute.length >= this.burstSize) {
      return false;
    }
    
    return true;
  }

  trackRequest(timestamp) {
    // Add to all windows
    Object.values(this.windows).forEach(window => {
      window.requests.push(timestamp);
    });
  }

  cleanWindows(now) {
    const cutoffs = {
      minute: now - 60000,
      hour: now - 3600000,
      day: now - 86400000
    };
    
    for (const [name, window] of Object.entries(this.windows)) {
      window.requests = window.requests.filter(t => t > cutoffs[name]);
    }
  }

  getWindowStatus() {
    const status = {};
    for (const [name, window] of Object.entries(this.windows)) {
      status[name] = {
        used: window.requests.length,
        limit: window.limit,
        remaining: Math.max(0, window.limit - window.requests.length)
      };
    }
    return status;
  }

  getRetryAfter() {
    // Find the earliest time when a request would be allowed
    const now = Date.now();
    let earliestRetry = Infinity;
    
    for (const [name, window] of Object.entries(this.windows)) {
      if (window.requests.length >= window.limit) {
        const oldestRequest = Math.min(...window.requests);
        const windowMs = name === 'minute' ? 60000 : name === 'hour' ? 3600000 : 86400000;
        const retryTime = oldestRequest + windowMs;
        earliestRetry = Math.min(earliestRetry, retryTime);
      }
    }
    
    return earliestRetry === Infinity ? 0 : Math.max(0, earliestRetry - now);
  }

  startQueueProcessor() {
    // Process queue every second
    this.queueTimer = setInterval(() => {
      this.processQueue();
    }, 1000);
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const now = Date.now();
    
    try {
      // Clean windows
      this.cleanWindows(now);
      
      // Process as many queued requests as allowed
      const toProcess = [];
      
      while (this.queue.length > 0 && this.isRequestAllowed(now)) {
        const item = this.queue.shift();
        
        // Skip if too old (> 5 minutes)
        if (now - item.timestamp > 300000) {
          this.logger.debug('Dropped stale queued request');
          continue;
        }
        
        toProcess.push(item);
        this.trackRequest(now);
      }
      
      // Re-emit the events
      for (const item of toProcess) {
        this.logger.debug('Processing queued request', {
          age: now - item.timestamp,
          queueRemaining: this.queue.length
        });
        
        // Update event timestamp
        item.event.timestamp = now;
        item.event.metadata.queued = true;
        item.event.metadata.queuedMs = now - item.timestamp;
        
        // Re-emit
        item.context.eventBus.emit(item.event.type, item.event);
        this.metrics.allowed++;
      }
      
      if (toProcess.length > 0) {
        this.updateSharedState(toProcess[0].context);
      }
      
    } finally {
      this.processing = false;
    }
  }

  updateSharedState(context) {
    const status = this.getWindowStatus();
    
    context.sharedState.set('rate-limiter:status', status);
    context.sharedState.set('rate-limiter:queue', this.queue.length);
    context.sharedState.set('rate-limiter:metrics', { ...this.metrics });
    
    // Calculate most restrictive limit
    let minPercentage = 100;
    for (const [name, window] of Object.entries(this.windows)) {
      const percentage = (window.requests.length / window.limit) * 100;
      minPercentage = Math.min(minPercentage, percentage);
    }
    context.sharedState.set('rate-limiter:usage', Math.round(minPercentage));
  }

  async shutdown() {
    // Stop queue processor
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
    }
    
    // Log final metrics
    this.logger.info('Rate limiter shutting down', {
      metrics: this.metrics,
      queuedRequests: this.queue.length
    });
    
    // Process remaining queue items as dropped
    if (this.queue.length > 0) {
      this.logger.warn(`Dropping ${this.queue.length} queued requests on shutdown`);
    }
  }

  // Public API for other plugins
  getRateLimitStatus() {
    return {
      windows: this.getWindowStatus(),
      queue: {
        size: this.queue.length,
        maxSize: this.queueSize,
        enabled: this.queueEnabled
      },
      metrics: { ...this.metrics },
      retryAfter: this.getRetryAfter()
    };
  }

  reset() {
    // Clear all tracking
    Object.values(this.windows).forEach(window => {
      window.requests = [];
    });
    this.queue = [];
    this.metrics = {
      allowed: 0,
      blocked: 0,
      queued: 0,
      dropped: 0
    };
    this.logger.info('Rate limiter reset');
  }
}

module.exports = RateLimiterPlugin;