# SDK Adapter Tests Implementation Plan

## Component Overview
Comprehensive test suite for the SDK Wrapper Adapter that verifies the integration between Claude Code SDK and the wrapper plugin system.

## Key Test Areas

### 1. Initialization Tests
- Adapter initialization with various configs
- Plugin loading from directory
- Database initialization
- Error handling for missing plugins
- Multiple initialization prevention

### 2. Query Flow Tests  
- Basic query execution through wrapped SDK
- Event emission verification (pre-query, response, completion)
- Message type handling (assistant, result, system)
- Token usage tracking
- Latency measurement

### 3. Plugin Integration Tests
- Plugin execution for each event type
- Plugin error isolation
- Disabled plugin filtering
- Plugin metrics collection
- Event metadata validation

### 4. Error Handling Tests
- SDK query failures
- Plugin initialization failures
- Plugin execution failures
- Database errors
- Network timeouts

### 5. Factory Function Tests
- createWrappedSDK with various configs
- Method binding verification
- Shutdown behavior
- Metrics retrieval

## Test Implementation Strategy

### Mock Setup
```typescript
// Mock the SDK
jest.mock('@instantlyeasy/claude-code-sdk-ts', () => ({
  query: jest.fn(),
  ClaudeCodeOptions: {},
  Message: {}
}));

// Mock plugin system
const mockPlugin = {
  name: 'test-plugin',
  manifest: { /* ... */ },
  initialize: jest.fn(),
  onEvent: jest.fn(),
  shutdown: jest.fn()
};

// Mock responses
const mockSDKResponse = async function* () {
  yield { type: 'assistant', content: [{ type: 'text', text: 'Hello' }] };
  yield { type: 'result', usage: { input_tokens: 10, output_tokens: 20 } };
};
```

### Test Categories

#### Unit Tests (30 cases)
- Constructor validation
- Config merging
- Session ID generation
- Logger initialization
- Event creation with proper metadata

#### Integration Tests (25 cases)
- Full query flow with real event bus
- Plugin loading and execution
- Database persistence
- Metrics aggregation
- Concurrent query handling

#### Edge Cases (15 cases)
- Empty plugin directory
- Malformed plugin manifests
- SDK timeout scenarios
- Large response handling
- Memory leak prevention

### Performance Tests
- Query throughput measurement
- Event processing overhead
- Plugin execution impact
- Memory usage tracking

## Test File Structure
```
tests/unit/sdk-adapter.test.ts
├── Initialization
│   ├── should initialize with default config
│   ├── should load plugins from directory
│   ├── should handle missing plugin directory
│   └── should prevent double initialization
├── Query Execution
│   ├── should wrap SDK query successfully
│   ├── should emit correct events
│   ├── should track token usage
│   └── should measure latency
├── Plugin Integration
│   ├── should execute plugins for events
│   ├── should handle plugin errors
│   └── should collect plugin metrics
├── Error Handling
│   ├── should handle SDK errors
│   ├── should handle plugin failures
│   └── should cleanup on errors
└── Factory Function
    ├── should create wrapped query
    ├── should bind methods correctly
    └── should shutdown gracefully
```

## Success Criteria
- 100% code coverage for sdk-adapter.ts
- All event types properly tested
- Error scenarios covered
- Performance benchmarks established
- Integration with real plugins verified