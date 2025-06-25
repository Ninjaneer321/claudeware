/**
 * Claude Code Wrapper
 * 
 * Main package exports for both SDK and programmatic usage.
 */

// For testing, export from the main files that have mock implementations
const { ClaudeWrapper } = require('./wrapper');
const { createWrappedSDK, SDKWrapperAdapter } = require('./sdk');

// Export main interfaces
module.exports = {
  ClaudeWrapper,
  createWrappedSDK,
  SDKWrapperAdapter
};