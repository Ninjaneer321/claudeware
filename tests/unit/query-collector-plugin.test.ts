import { QueryCollectorPlugin } from '../../src/plugins/builtin/query-collector';
import { QueryEvent, PluginContext } from '../../src/types';
import { EventEmitter } from 'events';

describe('QueryCollectorPlugin', () => {
  let plugin: QueryCollectorPlugin;
  let mockContext: PluginContext;
  let mockDataStore: any;
  let mockLogger: any;

  beforeEach(() => {
    mockDataStore = {
      saveQuery: jest.fn().mockResolvedValue(undefined),
      saveResponse: jest.fn().mockResolvedValue(undefined),
      saveOptimization: jest.fn().mockResolvedValue(undefined)
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis()
    };

    mockContext = {
      eventBus: new EventEmitter(),
      dataStore: mockDataStore,
      logger: mockLogger,
      config: {},
      sharedState: new Map()
    };

    plugin = new QueryCollectorPlugin();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      await plugin.initialize(mockContext);

      expect(plugin.isInitialized()).toBe(true);
    });

    it('should load categorization patterns from config', async () => {
      mockContext.config = {
        categorizationPatterns: [
          { name: 'Code', category: 'code', patterns: ['function', 'class'], priority: 1 },
          { name: 'Debug', category: 'debug', patterns: ['error', 'fix'], priority: 2 }
        ]
      };

      await plugin.initialize(mockContext);

      const testEvent: QueryEvent = {
        id: '123',
        type: 'query',
        timestamp: Date.now(),
        data: { content: 'fix this error in my function' },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'test'
        }
      };

      await plugin.onEvent(testEvent, mockContext);

      expect(mockDataStore.saveQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'code' // Should match 'function' pattern with higher priority
        })
      );
    });
  });

  describe('query processing', () => {
    beforeEach(async () => {
      await plugin.initialize(mockContext);
    });

    it('should process query events', async () => {
      const queryEvent: QueryEvent = {
        id: 'query-123',
        type: 'query',
        timestamp: Date.now(),
        data: {
          messages: [
            { role: 'user', content: 'Write a function to sort an array' }
          ],
          model: 'claude-3-opus'
        },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'claude-code'
        }
      };

      await plugin.onEvent(queryEvent, mockContext);

      expect(mockDataStore.saveQuery).toHaveBeenCalledWith({
        id: queryEvent.id,
        sessionId: queryEvent.metadata.sessionId,
        timestamp: queryEvent.timestamp,
        query: 'Write a function to sort an array',
        model: 'claude-3-opus',
        category: 'code',
        complexity: 'low',
        tokenCount: 7,
        metadata: {
          correlationId: queryEvent.metadata.correlationId,
          source: queryEvent.metadata.source
        }
      });
    });

    it('should handle multi-message queries', async () => {
      const queryEvent: QueryEvent = {
        id: 'query-123',
        type: 'query',
        timestamp: Date.now(),
        data: {
          messages: [
            { role: 'user', content: 'Help me with Python' },
            { role: 'assistant', content: 'What would you like help with?' },
            { role: 'user', content: 'I need to parse JSON files' }
          ],
          model: 'claude-3-opus'
        },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'claude-code'
        }
      };

      await plugin.onEvent(queryEvent, mockContext);

      expect(mockDataStore.saveQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'I need to parse JSON files', // Should use last user message
          tokenCount: 6
        })
      );
    });
  });

  describe('response processing', () => {
    beforeEach(async () => {
      await plugin.initialize(mockContext);
    });

    it('should process response events', async () => {
      const responseEvent: QueryEvent = {
        id: 'response-123',
        type: 'response',
        timestamp: Date.now(),
        data: {
          id: 'response-123',
          model: 'claude-3-opus',
          usage: {
            input_tokens: 50,
            output_tokens: 200
          },
          content: [
            { type: 'text', text: 'Here is a sorting function...' }
          ],
          stop_reason: 'end_turn'
        },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'claude-code',
          queryId: 'query-123',
          latencyMs: 1500
        }
      };

      await plugin.onEvent(responseEvent, mockContext);

      expect(mockDataStore.saveResponse).toHaveBeenCalledWith({
        id: responseEvent.id,
        queryId: 'query-123',
        sessionId: responseEvent.metadata.sessionId,
        timestamp: responseEvent.timestamp,
        response: 'Here is a sorting function...',
        model: 'claude-3-opus',
        inputTokens: 50,
        outputTokens: 200,
        latencyMs: 1500,
        finishReason: 'end_turn'
      });
    });

    it('should handle error responses', async () => {
      const errorEvent: QueryEvent = {
        id: 'response-123',
        type: 'response',
        timestamp: Date.now(),
        data: {
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded'
          }
        },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'claude-code',
          queryId: 'query-123'
        }
      };

      await plugin.onEvent(errorEvent, mockContext);

      expect(mockDataStore.saveResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          response: '',
          error: 'rate_limit_error: Rate limit exceeded'
        })
      );
    });
  });

  describe('categorization', () => {
    beforeEach(async () => {
      await plugin.initialize(mockContext);
    });

    const testCases = [
      {
        query: 'Write a Python function to calculate fibonacci',
        expectedCategory: 'code',
        expectedComplexity: 'medium'
      },
      {
        query: 'Fix this error: TypeError',
        expectedCategory: 'debug',
        expectedComplexity: 'low'
      },
      {
        query: 'Explain how async/await works in JavaScript',
        expectedCategory: 'explanation',
        expectedComplexity: 'medium'
      },
      {
        query: 'Refactor this class to use composition instead of inheritance and add comprehensive unit tests',
        expectedCategory: 'refactor',
        expectedComplexity: 'high'
      },
      {
        query: 'Hello',
        expectedCategory: 'general',
        expectedComplexity: 'low'
      },
      {
        query: 'Create a comprehensive test suite for the authentication module including unit tests, integration tests, and end-to-end tests with mocking strategies',
        expectedCategory: 'test',
        expectedComplexity: 'high'
      }
    ];

    testCases.forEach(({ query, expectedCategory, expectedComplexity }) => {
      it(`should categorize "${query}" as ${expectedCategory} with ${expectedComplexity} complexity`, async () => {
        const event: QueryEvent = {
          id: '123',
          type: 'query',
          timestamp: Date.now(),
          data: {
            messages: [{ role: 'user', content: query }],
            model: 'claude-3'
          },
          metadata: {
            correlationId: 'corr-123',
            sessionId: 'session-456',
            timestamp: Date.now(),
            source: 'test'
          }
        };

        await plugin.onEvent(event, mockContext);

        expect(mockDataStore.saveQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            category: expectedCategory,
            complexity: expectedComplexity
          })
        );
      });
    });
  });

  describe('optimization suggestions', () => {
    beforeEach(async () => {
      await plugin.initialize(mockContext);
    });

    it('should suggest cheaper model for simple queries', async () => {
      const queryEvent: QueryEvent = {
        id: 'query-123',
        type: 'query',
        timestamp: Date.now(),
        data: {
          messages: [{ role: 'user', content: 'What is 2 + 2?' }],
          model: 'claude-3-opus'
        },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'claude-code'
        }
      };

      await plugin.onEvent(queryEvent, mockContext);

      // Process response
      const responseEvent: QueryEvent = {
        id: 'response-123',
        type: 'response',
        timestamp: Date.now(),
        data: {
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [{ type: 'text', text: '4' }]
        },
        metadata: {
          ...queryEvent.metadata,
          queryId: queryEvent.id
        }
      };

      await plugin.onEvent(responseEvent, mockContext);

      expect(mockDataStore.saveOptimization).toHaveBeenCalledWith({
        queryId: queryEvent.id,
        suggestion: 'Consider using claude-3-haiku for simple queries',
        alternativeModel: 'claude-3-haiku',
        estimatedSavings: expect.any(Number),
        confidence: 'high'
      });
    });

    it('should not suggest optimization for complex queries', async () => {
      const queryEvent: QueryEvent = {
        id: 'query-123',
        type: 'query',
        timestamp: Date.now(),
        data: {
          messages: [{ 
            role: 'user', 
            content: 'Analyze this complex codebase and suggest architectural improvements with detailed implementation plans' 
          }],
          model: 'claude-3-opus'
        },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'claude-code'
        }
      };

      await plugin.onEvent(queryEvent, mockContext);

      const responseEvent: QueryEvent = {
        id: 'response-123',
        type: 'response',
        timestamp: Date.now(),
        data: {
          usage: { input_tokens: 100, output_tokens: 1000 }
        },
        metadata: {
          ...queryEvent.metadata,
          queryId: queryEvent.id
        }
      };

      await plugin.onEvent(responseEvent, mockContext);

      expect(mockDataStore.saveOptimization).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    beforeEach(async () => {
      await plugin.initialize(mockContext);
    });

    it('should cache categorization results', async () => {
      const query = 'Write a sorting function';
      const event1: QueryEvent = {
        id: '1',
        type: 'query',
        timestamp: Date.now(),
        data: {
          messages: [{ role: 'user', content: query }],
          model: 'claude-3'
        },
        metadata: {
          correlationId: 'corr-1',
          sessionId: 'session-1',
          timestamp: Date.now(),
          source: 'test'
        }
      };

      const event2 = { ...event1, id: '2' };

      // First call - should compute
      await plugin.onEvent(event1, mockContext);
      
      // Second call - should use cache
      await plugin.onEvent(event2, mockContext);

      // Both should have same categorization
      expect(mockDataStore.saveQuery).toHaveBeenCalledTimes(2);
      expect(mockDataStore.saveQuery).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({ category: 'code', complexity: 'low' })
      );
      expect(mockDataStore.saveQuery).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ category: 'code', complexity: 'low' })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await plugin.initialize(mockContext);
    });

    it('should handle missing data gracefully', async () => {
      const event: QueryEvent = {
        id: '123',
        type: 'query',
        timestamp: Date.now(),
        data: {}, // Missing messages
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'test'
        }
      };

      await expect(plugin.onEvent(event, mockContext)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockDataStore.saveQuery.mockRejectedValue(new Error('DB error'));

      const event: QueryEvent = {
        id: '123',
        type: 'query',
        timestamp: Date.now(),
        data: {
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-3'
        },
        metadata: {
          correlationId: 'corr-123',
          sessionId: 'session-456',
          timestamp: Date.now(),
          source: 'test'
        }
      };

      await expect(plugin.onEvent(event, mockContext)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'DB error',
          eventId: '123'
        }),
        'Failed to save query'
      );
    });
  });

  describe('shutdown', () => {
    it('should clean up resources on shutdown', async () => {
      await plugin.initialize(mockContext);
      await plugin.shutdown();

      expect(plugin.isInitialized()).toBe(false);
    });
  });
});