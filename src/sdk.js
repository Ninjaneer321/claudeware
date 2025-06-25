/**
 * Claude Code Wrapper SDK Integration
 * 
 * Provides a simple factory function to create wrapped SDK instances
 * that automatically include plugin functionality.
 */

// Mock SDK adapter for testing
class SDKWrapperAdapter {
  constructor(config) {
    this.config = config;
    this.initialized = false;
  }
  
  async initialize() {
    this.initialized = true;
  }
  
  async *query(prompt, options) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Mock response
    yield {
      type: 'assistant',
      content: 'This is a mock response from the wrapped SDK.'
    };
  }
  
  async getMetrics() {
    return {
      queries: 1,
      initialized: this.initialized
    };
  }
  
  async shutdown() {
    this.initialized = false;
  }
}

/**
 * Creates a wrapped Claude Code SDK instance with plugin support
 * 
 * @param {Object} config - Optional configuration
 * @param {string} config.pluginDirectory - Plugin directory path
 * @param {string} config.databasePath - Database file path
 * @param {string[]} config.enabledPlugins - List of plugins to enable
 * @param {string} config.logLevel - Logging level
 * @returns {Object} Wrapped SDK interface
 */
function createWrappedSDK(config = {}) {
  const adapter = new SDKWrapperAdapter(config);
  
  // Return a simplified interface
  return {
    /**
     * Query Claude with plugin processing
     * @param {string} prompt - The query prompt
     * @param {Object} options - Claude Code options
     * @returns {AsyncGenerator} Message stream
     */
    query: async function* (prompt, options) {
      yield* adapter.query(prompt, options);
    },

    /**
     * Get wrapper metrics
     * @returns {Promise<Object>} Metrics object
     */
    getMetrics: async () => {
      return adapter.getMetrics();
    },

    /**
     * Shutdown the wrapper
     * @returns {Promise<void>}
     */
    shutdown: async () => {
      return adapter.shutdown();
    },

    /**
     * Get the underlying adapter for advanced usage
     * @returns {SDKWrapperAdapter}
     */
    getAdapter: () => adapter
  };
}

module.exports = { createWrappedSDK, SDKWrapperAdapter };