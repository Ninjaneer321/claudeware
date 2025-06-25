/**
 * Cache Plugin
 * 
 * Caches Claude responses to speed up repeated or similar queries.
 * Uses LRU eviction and supports fuzzy matching for similar queries.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CachePlugin {
  constructor() {
    this.name = 'cache';
    this.version = '1.0.0';
    this.manifest = require('./manifest.json');
    
    // Cache storage
    this.cache = new Map(); // key -> { response, timestamp, hits }
    this.accessOrder = []; // LRU tracking
    
    // Configuration
    this.cacheSize = 100;
    this.ttl = 3600000; // 1 hour
    this.similarity = 0.95;
    this.persistCache = true;
    this.cachePath = null;
    
    // Metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      saves: 0
    };
    
    // State
    this.pendingQueries = new Map(); // queryId -> { hash, query }
  }

  async initialize(context) {
    this.logger = context.logger.child({ plugin: this.name });
    
    // Load configuration
    this.cacheSize = context.config.cacheSize || this.cacheSize;
    this.ttl = context.config.ttl || this.ttl;
    this.similarity = context.config.similarity || this.similarity;
    this.persistCache = context.config.persistCache !== false;
    this.cachePath = this.resolvePath(context.config.cachePath || '~/.claude-code/cache/responses.json');
    
    this.logger.info('Cache plugin initialized', {
      cacheSize: this.cacheSize,
      ttl: this.ttl,
      similarity: this.similarity,
      persistCache: this.persistCache
    });
    
    // Load persisted cache
    if (this.persistCache) {
      await this.loadCache();
    }
    
    // Share cache status
    context.sharedState.set('cache:enabled', true);
    context.sharedState.set('cache:size', this.cache.size);
  }

  async onEvent(event, context) {
    try {
      if (event.type === 'query') {
        await this.handleQuery(event, context);
      } else if (event.type === 'response') {
        await this.handleResponse(event, context);
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error processing event');
    }
  }

  async handleQuery(event, context) {
    const query = event.data.messages[0]?.content;
    if (!query) return;
    
    const queryId = event.id;
    const hash = this.hashQuery(query);
    
    // Check exact match
    let cacheHit = this.checkCache(hash);
    
    // Try fuzzy matching if no exact match
    if (!cacheHit && this.similarity < 1) {
      cacheHit = this.findSimilarQuery(query);
    }
    
    if (cacheHit) {
      // Cache hit!
      this.metrics.hits++;
      this.updateAccessOrder(cacheHit.key);
      cacheHit.entry.hits++;
      
      this.logger.debug('Cache hit', {
        query: query.substring(0, 50) + '...',
        hits: cacheHit.entry.hits,
        age: Date.now() - cacheHit.entry.timestamp
      });
      
      // Emit cached response
      const cachedEvent = {
        id: event.id + '-cached',
        type: 'response',
        timestamp: Date.now(),
        data: cacheHit.entry.response,
        metadata: {
          ...event.metadata,
          cached: true,
          cacheKey: cacheHit.key,
          originalTimestamp: cacheHit.entry.timestamp
        }
      };
      
      // Short-circuit the request
      context.eventBus.emit('response', cachedEvent);
      context.eventBus.emit('cache-hit', {
        queryId,
        query,
        cacheKey: cacheHit.key,
        savings: cacheHit.entry.response.usage
      });
      
      // Share metrics
      context.sharedState.set('cache:hits', this.metrics.hits);
      context.sharedState.set('cache:hitRate', this.getHitRate());
      
    } else {
      // Cache miss
      this.metrics.misses++;
      this.pendingQueries.set(queryId, { hash, query });
      
      this.logger.debug('Cache miss', {
        query: query.substring(0, 50) + '...'
      });
      
      context.sharedState.set('cache:misses', this.metrics.misses);
    }
  }

  async handleResponse(event, context) {
    const queryId = event.metadata.queryId;
    const pending = this.pendingQueries.get(queryId);
    
    if (!pending || event.metadata.cached) {
      return; // Not tracking this query or it's already cached
    }
    
    // Don't cache errors
    if (event.data.error || !event.data.content) {
      this.pendingQueries.delete(queryId);
      return;
    }
    
    // Add to cache
    this.addToCache(pending.hash, {
      response: event.data,
      timestamp: Date.now(),
      hits: 0,
      query: pending.query
    });
    
    this.pendingQueries.delete(queryId);
    this.metrics.saves++;
    
    this.logger.debug('Response cached', {
      query: pending.query.substring(0, 50) + '...',
      cacheSize: this.cache.size
    });
    
    // Persist cache
    if (this.persistCache) {
      await this.saveCache().catch(err => 
        this.logger.error({ error: err.message }, 'Failed to persist cache')
      );
    }
    
    // Update shared state
    context.sharedState.set('cache:size', this.cache.size);
    context.sharedState.set('cache:saves', this.metrics.saves);
  }

  checkCache(hash) {
    const entry = this.cache.get(hash);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(hash);
      return null;
    }
    
    return { key: hash, entry };
  }

  findSimilarQuery(query) {
    const queryLower = query.toLowerCase();
    const queryTokens = this.tokenize(queryLower);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [key, entry] of this.cache) {
      // Skip expired entries
      if (Date.now() - entry.timestamp > this.ttl) continue;
      
      const score = this.calculateSimilarity(queryTokens, entry.query);
      
      if (score >= this.similarity && score > bestScore) {
        bestScore = score;
        bestMatch = { key, entry };
      }
    }
    
    if (bestMatch) {
      this.logger.debug('Found similar query', {
        similarity: Math.round(bestScore * 100) + '%',
        original: query.substring(0, 50) + '...',
        cached: bestMatch.entry.query.substring(0, 50) + '...'
      });
    }
    
    return bestMatch;
  }

  calculateSimilarity(queryTokens, cachedQuery) {
    const cachedTokens = this.tokenize(cachedQuery.toLowerCase());
    
    // Jaccard similarity
    const intersection = queryTokens.filter(t => cachedTokens.includes(t));
    const union = [...new Set([...queryTokens, ...cachedTokens])];
    
    return intersection.length / union.length;
  }

  tokenize(text) {
    // Simple tokenization - can be improved
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  addToCache(key, entry) {
    // Check if we need to evict
    if (this.cache.size >= this.cacheSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, entry);
    this.accessOrder.push(key);
  }

  updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  evictOldest() {
    if (this.accessOrder.length === 0) return;
    
    const oldestKey = this.accessOrder.shift();
    this.cache.delete(oldestKey);
    this.metrics.evictions++;
    
    this.logger.debug('Evicted cache entry', { key: oldestKey });
  }

  hashQuery(query) {
    return crypto
      .createHash('sha256')
      .update(query.trim().toLowerCase())
      .digest('hex')
      .substring(0, 16);
  }

  resolvePath(filePath) {
    if (filePath.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE;
      return path.join(home, filePath.slice(1));
    }
    return path.resolve(filePath);
  }

  async loadCache() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const saved = JSON.parse(data);
      
      // Rebuild cache from saved data
      let loaded = 0;
      for (const [key, entry] of Object.entries(saved.cache || {})) {
        // Skip expired entries
        if (Date.now() - entry.timestamp <= this.ttl) {
          this.cache.set(key, entry);
          this.accessOrder.push(key);
          loaded++;
        }
      }
      
      // Restore metrics
      if (saved.metrics) {
        Object.assign(this.metrics, saved.metrics);
      }
      
      this.logger.info('Loaded cache from disk', {
        entries: loaded,
        expired: Object.keys(saved.cache || {}).length - loaded
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error({ error: error.message }, 'Failed to load cache');
      }
    }
  }

  async saveCache() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.cachePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Convert Map to object for JSON serialization
      const cacheObj = {};
      for (const [key, value] of this.cache) {
        cacheObj[key] = value;
      }
      
      const data = {
        version: this.version,
        saved: new Date().toISOString(),
        cache: cacheObj,
        metrics: this.metrics
      };
      
      await fs.writeFile(this.cachePath, JSON.stringify(data, null, 2));
      
      this.logger.debug('Saved cache to disk', {
        entries: this.cache.size,
        size: JSON.stringify(data).length
      });
    } catch (error) {
      throw new Error(`Failed to save cache: ${error.message}`);
    }
  }

  getHitRate() {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? (this.metrics.hits / total) * 100 : 0;
  }

  async shutdown() {
    // Save cache before shutdown
    if (this.persistCache && this.cache.size > 0) {
      await this.saveCache().catch(err =>
        this.logger.error({ error: err.message }, 'Failed to save cache on shutdown')
      );
    }
    
    this.logger.info('Cache plugin shutting down', {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: Math.round(this.getHitRate()) + '%',
      cacheSize: this.cache.size
    });
  }

  // Public API for other plugins
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cacheSize,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: this.getHitRate(),
      evictions: this.metrics.evictions,
      saves: this.metrics.saves
    };
  }

  clearCache() {
    this.cache.clear();
    this.accessOrder = [];
    this.logger.info('Cache cleared');
  }
}

module.exports = CachePlugin;