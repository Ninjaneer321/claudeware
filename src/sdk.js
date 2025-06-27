/**
 * Claudeware SDK Integration
 * 
 * Re-exports the TypeScript SDK adapter implementation
 */

// Re-export the compiled TypeScript implementation
const { createWrappedSDK, SDKWrapperAdapter } = require('./adapters/sdk-adapter');

module.exports = { createWrappedSDK, SDKWrapperAdapter };