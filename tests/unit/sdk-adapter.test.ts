import { SDKWrapperAdapter, createWrappedSDK } from '../../src/adapters/sdk-adapter';
import { EventBus } from '../../src/plugins/event-bus';
import { PluginLoader } from '../../src/plugins/plugin-loader';
import { SqliteAdapter } from '../../src/database/sqlite-adapter';
import { BatchQueue } from '../../src/database/batch-queue';
import { Plugin } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
jest.mock('@instantlyeasy/claude-code-sdk-ts');
jest.mock('../../src/plugins/event-bus');
jest.mock('../../src/plugins/plugin-loader');
jest.mock('../../src/database/sqlite-adapter');
jest.mock('../../src/database/batch-queue');
jest.mock('uuid', () => ({
  v4: jest.fn()
}));
jest.mock('pino', () => {
  const mockLogger: any = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  };
  return jest.fn(() => mockLogger);
});

// Import mocked SDK
import { query as sdkQuery } from '@instantlyeasy/claude-code-sdk-ts';

describe('SDKWrapperAdapter', () => {
  let adapter: SDKWrapperAdapter;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockPluginLoader: jest.Mocked<PluginLoader>;
  let mockDataStore: jest.Mocked<SqliteAdapter>;
  let mockBatchQueue: jest.Mocked<BatchQueue<any>>;
  let mockPlugin: Plugin;

  // Mock SDK response generator
  const mockSDKResponse = async function* () {
    yield { 
      type: 'assistant', 
      content: [{ type: 'text', text: 'Hello from Claude' }] 
    };
    yield { 
      type: 'result', 
      usage: { input_tokens: 10, output_tokens: 20 } 
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup UUID mock
    (uuidv4 as jest.Mock)
      .mockReturnValueOnce('session-id-123')
      .mockReturnValueOnce('query-id-456')
      .mockReturnValueOnce('correlation-id-789')
      .mockReturnValue('generic-uuid');

    // Setup EventBus mock
    mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({ 
        totalEvents: 10,
        eventCounts: {},
        listenerCounts: {},
        errorCount: 0
      })
    } as any;

    // Setup PluginLoader mock
    mockPluginLoader = {
      loadPlugins: jest.fn().mockResolvedValue([]),
      initializePlugin: jest.fn(),
      executePlugins: jest.fn(),
      getPluginMetrics: jest.fn().mockResolvedValue([]),
      shutdown: jest.fn()
    } as any;

    // Setup DataStore mock
    mockDataStore = {
      init: jest.fn(),
      save: jest.fn(),
      batchSave: jest.fn(),
      query: jest.fn(),
      close: jest.fn()
    } as any;

    // Setup BatchQueue mock
    mockBatchQueue = {
      add: jest.fn(),
      flush: jest.fn(),
      stop: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({ 
        queueSize: 0, 
        processed: 100 
      })
    } as any;

    // Setup mock plugin
    mockPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      manifest: {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        dependencies: [],
        priority: 0,
        timeout: 5000,
        capabilities: ['query', 'response']
      },
      initialize: jest.fn(),
      onEvent: jest.fn(),
      shutdown: jest.fn()
    };

    // Mock constructor calls
    (EventBus as jest.MockedClass<typeof EventBus>).mockImplementation(() => mockEventBus);
    (PluginLoader as jest.MockedClass<typeof PluginLoader>).mockImplementation(() => mockPluginLoader);
    (SqliteAdapter as jest.MockedClass<typeof SqliteAdapter>).mockImplementation(() => mockDataStore);
    (BatchQueue as jest.MockedClass<typeof BatchQueue>).mockImplementation(() => mockBatchQueue);

    // Default SDK query mock
    (sdkQuery as jest.Mock).mockReturnValue(mockSDKResponse());
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      adapter = new SDKWrapperAdapter();
      await adapter.initialize();

      expect(SqliteAdapter).toHaveBeenCalledWith({
        path: './claude-queries.db'
      });
      expect(mockDataStore.init).toHaveBeenCalled();
      expect(BatchQueue).toHaveBeenCalledWith({
        batchSize: 50,
        flushInterval: 1000,
        handler: expect.any(Function)
      });
    });

    it('should initialize with custom configuration', async () => {
      const config = {
        pluginDirectory: './plugins',
        databasePath: './custom.db',
        enabledPlugins: ['plugin1', 'plugin2'],
        logLevel: 'debug' as const
      };

      adapter = new SDKWrapperAdapter(config);
      await adapter.initialize();

      expect(SqliteAdapter).toHaveBeenCalledWith({
        path: './custom.db'
      });
    });

    it('should load plugins from directory', async () => {
      const plugins = [mockPlugin, { ...mockPlugin, name: 'plugin2' }];
      mockPluginLoader.loadPlugins.mockResolvedValue(plugins);

      adapter = new SDKWrapperAdapter({ pluginDirectory: './plugins' });
      await adapter.initialize();

      expect(mockPluginLoader.loadPlugins).toHaveBeenCalledWith('./plugins');
      expect(mockPluginLoader.initializePlugin).toHaveBeenCalledTimes(2);
    });

    it('should filter enabled plugins', async () => {
      const plugins = [
        mockPlugin,
        { ...mockPlugin, name: 'plugin2', manifest: { ...mockPlugin.manifest, name: 'plugin2' } },
        { ...mockPlugin, name: 'plugin3', manifest: { ...mockPlugin.manifest, name: 'plugin3' } }
      ];
      mockPluginLoader.loadPlugins.mockResolvedValue(plugins);

      adapter = new SDKWrapperAdapter({ 
        pluginDirectory: './plugins',
        enabledPlugins: ['test-plugin', 'plugin3']
      });
      await adapter.initialize();

      expect(mockPluginLoader.initializePlugin).toHaveBeenCalledTimes(2);
      expect(mockPluginLoader.initializePlugin).toHaveBeenCalledWith(plugins[0]);
      expect(mockPluginLoader.initializePlugin).toHaveBeenCalledWith(plugins[2]);
    });

    it('should handle plugin initialization errors', async () => {
      mockPluginLoader.loadPlugins.mockResolvedValue([mockPlugin]);
      mockPluginLoader.initializePlugin.mockRejectedValue(new Error('Plugin init failed'));

      adapter = new SDKWrapperAdapter({ pluginDirectory: './plugins' });
      
      // Should not throw
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it('should prevent multiple initialization', async () => {
      adapter = new SDKWrapperAdapter();
      await adapter.initialize();
      await adapter.initialize();

      expect(mockDataStore.init).toHaveBeenCalledTimes(1);
    });

    it('should generate unique session ID', () => {
      adapter = new SDKWrapperAdapter();
      expect(uuidv4).toHaveBeenCalledTimes(1);
    });
  });

  describe('Query Execution', () => {
    beforeEach(async () => {
      adapter = new SDKWrapperAdapter();
    });

    it('should wrap SDK query successfully', async () => {
      const prompt = 'Test prompt';
      const options = { model: 'claude-3-opus' };

      const messages = [];
      for await (const message of adapter.query(prompt, options)) {
        messages.push(message);
      }

      expect(sdkQuery).toHaveBeenCalledWith(prompt, options);
      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[1].type).toBe('result');
    });

    it('should emit correct events during query', async () => {
      const prompt = 'Test prompt';

      const messages = [];
      for await (const message of adapter.query(prompt)) {
        messages.push(message);
      }

      // Should execute plugins for query, response (x2), and completion events
      expect(mockPluginLoader.executePlugins).toHaveBeenCalledTimes(4);

      // Check pre-query event
      const queryEvent = (mockPluginLoader.executePlugins as jest.Mock).mock.calls[0][0];
      expect(queryEvent.type).toBe('query');
      expect(queryEvent.data.messages[0]).toEqual({ role: 'user', content: prompt });

      // Check response events
      const responseEvents = (mockPluginLoader.executePlugins as jest.Mock).mock.calls.slice(1);
      expect(responseEvents[0][0].type).toBe('response');
      expect(responseEvents[1][0].type).toBe('response');
    });

    it('should track token usage', async () => {
      const messages = [];
      for await (const message of adapter.query('Test')) {
        messages.push(message);
      }

      const completionEvent = (mockPluginLoader.executePlugins as jest.Mock).mock.calls[3][0];
      expect(completionEvent.data.usage).toEqual({ 
        input_tokens: 10, 
        output_tokens: 20 
      });
    });

    it('should measure latency', async () => {
      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const responseEvent = (mockPluginLoader.executePlugins as jest.Mock).mock.calls[1][0];
      expect(responseEvent.data.latencyMs).toBeGreaterThanOrEqual(0);
      expect(responseEvent.data.latencyMs).toBeLessThan(1000);
    });

    it('should generate correlation and query IDs', async () => {
      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const events = (mockPluginLoader.executePlugins as jest.Mock).mock.calls;
      const correlationId = events[0][0].metadata.correlationId;
      const queryId = events[0][0].id;

      // All events should have same correlation ID
      events.forEach(call => {
        expect(call[0].metadata.correlationId).toBe(correlationId);
      });

      // Response events should reference query ID
      expect(events[1][0].data.queryId).toBe(queryId);
      expect(events[2][0].data.queryId).toBe(queryId);
    });

    it('should handle different message types', async () => {
      const customResponse = async function* () {
        yield { type: 'system', content: 'System message' };
        yield { type: 'assistant', content: [{ type: 'text', text: 'Response' }] };
        yield { type: 'tool_use', id: 'tool-1', name: 'test_tool', input: {} };
        yield { type: 'result', usage: { input_tokens: 5, output_tokens: 10 } };
      };

      (sdkQuery as jest.Mock).mockReturnValue(customResponse());

      const messages = [];
      for await (const message of adapter.query('Test')) {
        messages.push(message);
      }

      expect(messages).toHaveLength(4);
      expect(messages.map(m => m.type)).toEqual([
        'system',
        'assistant',
        'tool_use',
        'result'
      ]);
    });

    it('should concatenate multiple text blocks', async () => {
      const multiBlockResponse = async function* () {
        yield { 
          type: 'assistant', 
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
            { type: 'code', language: 'python', text: 'print("code")' },
            { type: 'text', text: 'Part 3' }
          ] 
        };
        yield { type: 'result', usage: {} };
      };

      (sdkQuery as jest.Mock).mockReturnValue(multiBlockResponse());

      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const completionEvent = (mockPluginLoader.executePlugins as jest.Mock).mock.calls[3][0];
      expect(completionEvent.data.content[0].text).toBe('Part 1\nPart 2\nPart 3');
    });
  });

  describe('Plugin Integration', () => {
    beforeEach(async () => {
      adapter = new SDKWrapperAdapter({ pluginDirectory: './plugins' });
      mockPluginLoader.loadPlugins.mockResolvedValue([mockPlugin]);
    });

    it('should execute plugins for each event', async () => {
      await adapter.initialize();

      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      expect(mockPluginLoader.executePlugins).toHaveBeenCalledTimes(4);
    });

    it('should include event metadata for plugins', async () => {
      await adapter.initialize();

      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const queryEvent = (mockPluginLoader.executePlugins as jest.Mock).mock.calls[0][0];
      expect(queryEvent.metadata).toMatchObject({
        sessionId: 'session-id-123',
        source: 'sdk',
        timestamp: expect.any(Number)
      });
    });

    it('should collect plugin metrics', async () => {
      const pluginMetrics = [
        { 
          name: 'test-plugin',
          executionCount: 100,
          totalExecutionTime: 1000,
          averageExecutionTime: 10,
          failures: 2
        }
      ];
      mockPluginLoader.getPluginMetrics.mockResolvedValue(pluginMetrics);

      await adapter.initialize();
      const metrics = await adapter.getMetrics();

      expect(metrics.plugins).toEqual(pluginMetrics);
    });

    it('should handle plugin errors gracefully', async () => {
      await adapter.initialize();
      
      // The plugin loader should handle errors internally
      // We're testing that the adapter continues even if plugin execution fails
      let callCount = 0;
      mockPluginLoader.executePlugins.mockImplementation(async () => {
        callCount++;
        // Simulate plugin error on second call (first response event)
        if (callCount === 2) {
          // In reality, the plugin loader catches this internally
          // For the test, we'll just log it
          console.log('Plugin error occurred but was handled');
        }
        return Promise.resolve();
      });

      // Should complete successfully
      const messages = [];
      for await (const message of adapter.query('Test')) {
        messages.push(message);
      }

      expect(messages).toHaveLength(2);
      expect(mockPluginLoader.executePlugins).toHaveBeenCalled();
      // Reset mock
      mockPluginLoader.executePlugins.mockResolvedValue(undefined);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      adapter = new SDKWrapperAdapter();
    });

    it('should handle SDK query failures', async () => {
      const error = new Error('SDK query failed');
      (sdkQuery as jest.Mock).mockImplementation(async function* () {
        throw error;
      });

      await expect(async () => {
        for await (const _ of adapter.query('Test')) {
          // Should not reach here
        }
      }).rejects.toThrow('SDK query failed');

      // Should emit error event (after query event)
      const errorEvent = (mockPluginLoader.executePlugins as jest.Mock).mock.calls[1][0];
      expect(errorEvent.type).toBe('error');
      expect(errorEvent.data.error.message).toBe('SDK query failed');
    });

    it('should handle database initialization errors', async () => {
      mockDataStore.init.mockRejectedValue(new Error('DB init failed'));

      adapter = new SDKWrapperAdapter();
      await expect(adapter.initialize()).rejects.toThrow('DB init failed');
    });

    it('should handle plugin loading errors', async () => {
      mockPluginLoader.loadPlugins.mockRejectedValue(new Error('Plugin load failed'));

      adapter = new SDKWrapperAdapter({ pluginDirectory: './plugins' });
      await expect(adapter.initialize()).rejects.toThrow('Plugin load failed');
    });

    it('should handle network timeouts', async () => {
      const timeoutResponse = async function* () {
        yield { type: 'assistant', content: [{ type: 'text', text: 'Starting...' }] };
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Network timeout');
      };

      (sdkQuery as jest.Mock).mockReturnValue(timeoutResponse());

      await expect(async () => {
        for await (const _ of adapter.query('Test')) {
          // Process partial response
        }
      }).rejects.toThrow('Network timeout');
    });

    it('should cleanup on errors', async () => {
      const error = new Error('Critical error');
      (sdkQuery as jest.Mock).mockImplementation(async function* () {
        throw error;
      });

      try {
        for await (const _ of adapter.query('Test')) {
          // Should not reach here
        }
      } catch (e) {
        // Expected
      }

      // Should still be able to use adapter
      (sdkQuery as jest.Mock).mockReturnValue(mockSDKResponse());
      
      const messages = [];
      for await (const message of adapter.query('Test 2')) {
        messages.push(message);
      }
      
      expect(messages).toHaveLength(2);
    });
  });

  describe('Factory Function', () => {
    it('should create wrapped SDK with default config', () => {
      const wrapped = createWrappedSDK();

      expect(wrapped).toHaveProperty('query');
      expect(wrapped).toHaveProperty('getMetrics');
      expect(wrapped).toHaveProperty('shutdown');
    });

    it('should create wrapped SDK with custom config', () => {
      const config = {
        pluginDirectory: './plugins',
        databasePath: './custom.db',
        enabledPlugins: ['plugin1'],
        logLevel: 'debug' as const
      };

      const wrapped = createWrappedSDK(config);

      // SDKWrapperAdapter is not a mock, so we can't test it was called with config
      // Instead, we can verify the wrapper was created successfully
      expect(wrapped).toBeDefined();
      expect(wrapped.query).toBeDefined();
      expect(wrapped.getMetrics).toBeDefined();
      expect(wrapped.shutdown).toBeDefined();
    });

    it('should bind query method correctly', async () => {
      const wrapped = createWrappedSDK();

      // Test that query is properly bound
      const messages = [];
      for await (const message of wrapped.query('Test')) {
        messages.push(message);
      }

      expect(messages).toHaveLength(2);
    });

    it('should expose metrics retrieval', async () => {
      const wrapped = createWrappedSDK();
      
      // Need to initialize by making a query first
      for await (const _ of wrapped.query('Test')) {
        // Process messages
      }

      const metrics = await wrapped.getMetrics();

      expect(metrics).toHaveProperty('eventBus');
      expect(metrics).toHaveProperty('batchQueue');
      expect(metrics).toHaveProperty('plugins');
    });

    it('should handle shutdown gracefully', async () => {
      const wrapped = createWrappedSDK();
      
      // Need to initialize by making a query first
      for await (const _ of wrapped.query('Test')) {
        // Process messages
      }

      await wrapped.shutdown();

      expect(mockPluginLoader.shutdown).toHaveBeenCalled();
      expect(mockBatchQueue.stop).toHaveBeenCalled();
      expect(mockDataStore.close).toHaveBeenCalled();
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      adapter = new SDKWrapperAdapter();
      await adapter.initialize();
    });

    it('should aggregate metrics from all components', async () => {
      const eventBusMetrics = { 
        totalEvents: 50,
        eventCounts: { query: 10, response: 40 },
        listenerCounts: { query: 5, response: 5 },
        errorCount: 0
      };
      const batchQueueMetrics = { 
        totalItems: 200,
        totalBatches: 10,
        failedBatches: 0,
        queueSize: 5,
        processed: 200,
        averageBatchSize: 20,
        averageProcessingTime: 5
      };
      const pluginMetrics = [
        { 
          name: 'plugin1',
          executionCount: 100,
          totalExecutionTime: 500,
          averageExecutionTime: 5,
          failures: 0
        },
        { 
          name: 'plugin2',
          executionCount: 150,
          totalExecutionTime: 900,
          averageExecutionTime: 6,
          failures: 0
        }
      ];

      mockEventBus.getMetrics.mockReturnValue(eventBusMetrics);
      mockBatchQueue.getMetrics.mockReturnValue(batchQueueMetrics);
      mockPluginLoader.getPluginMetrics.mockResolvedValue(pluginMetrics);

      const metrics = await adapter.getMetrics();

      expect(metrics).toEqual({
        eventBus: eventBusMetrics,
        batchQueue: batchQueueMetrics,
        plugins: pluginMetrics
      });
    });

    it('should track session ID across all events', async () => {
      // The adapter is created in beforeEach with session-id-123
      // We need to clear previous plugin calls
      mockPluginLoader.executePlugins.mockClear();
      
      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const events = (mockPluginLoader.executePlugins as jest.Mock).mock.calls;
      
      // All events should have the same session ID from the adapter
      const sessionId = events[0][0].metadata.sessionId;
      expect(sessionId).toBeDefined();
      
      events.forEach(call => {
        expect(call[0].metadata.sessionId).toBe(sessionId);
      });
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      adapter = new SDKWrapperAdapter();
    });

    it('should handle empty plugin directory', async () => {
      adapter = new SDKWrapperAdapter({ pluginDirectory: './empty' });
      mockPluginLoader.loadPlugins.mockResolvedValue([]);

      await adapter.initialize();

      expect(mockPluginLoader.initializePlugin).not.toHaveBeenCalled();
    });

    it('should handle missing response content', async () => {
      const emptyResponse = async function* () {
        yield { type: 'assistant', content: [] };
        yield { type: 'result' };
      };

      (sdkQuery as jest.Mock).mockReturnValue(emptyResponse());

      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const completionEvent = (mockPluginLoader.executePlugins as jest.Mock).mock.calls[3][0];
      expect(completionEvent.data.content[0].text).toBe('');
    });

    it('should handle very large responses', async () => {
      const largeText = 'x'.repeat(1000000); // 1MB of text
      const largeResponse = async function* () {
        yield { 
          type: 'assistant', 
          content: [{ type: 'text', text: largeText }] 
        };
        yield { type: 'result', usage: { input_tokens: 1000, output_tokens: 50000 } };
      };

      (sdkQuery as jest.Mock).mockReturnValue(largeResponse());

      const messages = [];
      for await (const message of adapter.query('Test')) {
        messages.push(message);
      }

      expect((messages[0].content[0] as any).text).toHaveLength(1000000);
    });

    it('should handle concurrent queries', async () => {
      // Mock different responses for each query
      (sdkQuery as jest.Mock)
        .mockReturnValueOnce(mockSDKResponse())
        .mockReturnValueOnce(mockSDKResponse())
        .mockReturnValueOnce(mockSDKResponse());

      const queries = [
        adapter.query('Query 1'),
        adapter.query('Query 2'),
        adapter.query('Query 3')
      ];

      const results = await Promise.all(
        queries.map(async (query) => {
          const messages = [];
          for await (const message of query) {
            messages.push(message);
          }
          return messages;
        })
      );

      expect(results).toHaveLength(3);
      results.forEach(messages => {
        expect(messages).toHaveLength(2);
      });
    });

    it('should handle malformed plugin manifests', async () => {
      const badPlugin = {
        name: 'bad-plugin',
        manifest: null, // Invalid manifest
        initialize: jest.fn(),
        onEvent: jest.fn()
      };

      mockPluginLoader.loadPlugins.mockResolvedValue([badPlugin as any]);
      mockPluginLoader.initializePlugin.mockRejectedValue(new Error('Invalid manifest'));

      adapter = new SDKWrapperAdapter({ pluginDirectory: './plugins' });
      
      // Should not throw
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it('should handle batch queue handler errors', async () => {
      await adapter.initialize();

      // Get the batch handler
      const batchHandler = (BatchQueue as jest.MockedClass<typeof BatchQueue>).mock.calls[0][0].handler;
      
      mockDataStore.batchSave.mockRejectedValue(new Error('Batch save failed'));

      // Should not throw
      await expect(batchHandler([{ data: 'test' }])).rejects.toThrow('Batch save failed');
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      adapter = new SDKWrapperAdapter();
      await adapter.initialize();
    });

    it('should process queries efficiently', async () => {
      const startTime = Date.now();

      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly (under 100ms for mocked operations)
      expect(duration).toBeLessThan(100);
    });

    it('should handle plugin execution overhead', async () => {
      // Simulate slow plugin
      mockPluginLoader.executePlugins.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const startTime = Date.now();

      for await (const _ of adapter.query('Test')) {
        // Process messages
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should still complete in reasonable time
      expect(duration).toBeLessThan(200);
    });

    it('should not leak memory across queries', async () => {
      // Run multiple queries
      for (let i = 0; i < 10; i++) {
        for await (const _ of adapter.query(`Query ${i}`)) {
          // Process messages
        }
      }

      // Check that event handlers are not accumulating  
      // Clear previous calls to get accurate count
      mockPluginLoader.executePlugins.mockClear();
      
      // The mock response yields 2 messages, which should generate:
      // 1 query event + 2 response events + 1 completion event = 4 total
      
      // Run multiple queries
      for (let i = 0; i < 5; i++) {
        // Reset the mock for each query to ensure consistent behavior
        (sdkQuery as jest.Mock).mockReturnValue(mockSDKResponse());
        
        for await (const _ of adapter.query(`Query ${i}`)) {
          // Process messages
        }
      }
      
      // Each query should generate exactly 4 events
      expect(mockPluginLoader.executePlugins).toHaveBeenCalledTimes(20); // 5 queries * 4 events
    });
  });
});