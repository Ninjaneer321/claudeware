import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PluginLoader } from '../../src/plugins/plugin-loader';
import { Plugin, PluginManifest, PluginContext } from '../../src/types';
import { DataStore } from '../../src/types';
import { Logger } from 'pino';

// Mock fs module
jest.mock('fs/promises');

describe('PluginLoader', () => {
  let pluginLoader: PluginLoader;
  let mockEventBus: EventEmitter;
  let mockDataStore: jest.Mocked<DataStore>;
  let mockLogger: jest.Mocked<Logger>;
  let mockContext: PluginContext;

  beforeEach(() => {
    mockEventBus = new EventEmitter();
    mockDataStore = {
      init: jest.fn(),
      close: jest.fn(),
      saveQuery: jest.fn(),
      saveResponse: jest.fn(),
      saveOptimization: jest.fn(),
      batchSave: jest.fn(),
      getQuery: jest.fn(),
      getResponse: jest.fn(),
      getSessionQueries: jest.fn(),
      getQueryStats: jest.fn()
    };
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis()
    } as any;

    mockContext = {
      eventBus: mockEventBus,
      dataStore: mockDataStore,
      logger: mockLogger,
      config: {},
      sharedState: new Map()
    };

    pluginLoader = new PluginLoader(mockContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('loadPlugins', () => {
    it('should load plugins from directory', async () => {
      const mockFiles = ['plugin1', 'plugin2', '.hidden'];
      const mockManifest1: PluginManifest = {
        name: 'plugin1',
        version: '1.0.0',
        dependencies: [],
        priority: 1,
        timeout: 5000,
        capabilities: ['query-analysis']
      };
      const mockManifest2: PluginManifest = {
        name: 'plugin2',
        version: '1.0.0',
        dependencies: [],
        priority: 2,
        timeout: 5000,
        capabilities: ['optimization']
      };

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.stat as jest.Mock).mockImplementation(async (filePath) => ({
        isDirectory: () => !filePath.includes('.hidden')
      }));
      (fs.readFile as jest.Mock).mockImplementation(async (filePath) => {
        if (filePath.includes('plugin1')) {
          return JSON.stringify(mockManifest1);
        }
        return JSON.stringify(mockManifest2);
      });

      // Mock dynamic imports
      jest.doMock(path.join('/plugins', 'plugin1'), () => ({
        default: class MockPlugin1 implements Plugin {
          name = 'plugin1';
          version = '1.0.0';
          manifest = mockManifest1;
          async initialize() {}
          async onEvent() {}
          async shutdown() {}
        }
      }), { virtual: true });

      jest.doMock(path.join('/plugins', 'plugin2'), () => ({
        default: class MockPlugin2 implements Plugin {
          name = 'plugin2';
          version = '1.0.0';
          manifest = mockManifest2;
          async initialize() {}
          async onEvent() {}
          async shutdown() {}
        }
      }), { virtual: true });

      const plugins = await pluginLoader.loadPlugins('/plugins');

      expect(plugins).toHaveLength(2);
      expect(plugins[0].manifest.priority).toBe(1);
      expect(plugins[1].manifest.priority).toBe(2);
    });

    it('should handle plugin loading errors gracefully', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['bad-plugin']);
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => true });
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('Invalid manifest'));

      const plugins = await pluginLoader.loadPlugins('/plugins');

      expect(plugins).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          plugin: 'bad-plugin',
          error: 'Invalid manifest'
        }),
        'Failed to load plugin'
      );
    });
  });

  describe('dependency resolution', () => {
    it('should resolve plugin dependencies correctly', async () => {
      const plugins = [
        {
          manifest: {
            name: 'A',
            dependencies: ['B', 'C']
          }
        },
        {
          manifest: {
            name: 'B',
            dependencies: ['C']
          }
        },
        {
          manifest: {
            name: 'C',
            dependencies: []
          }
        }
      ] as Plugin[];

      const sorted = await pluginLoader.resolveDependencies(plugins);

      expect(sorted.map(p => p.manifest.name)).toEqual(['C', 'B', 'A']);
    });

    it('should detect circular dependencies', async () => {
      const plugins = [
        {
          manifest: {
            name: 'A',
            dependencies: ['B']
          }
        },
        {
          manifest: {
            name: 'B',
            dependencies: ['C']
          }
        },
        {
          manifest: {
            name: 'C',
            dependencies: ['A'] // Circular!
          }
        }
      ] as Plugin[];

      await expect(pluginLoader.resolveDependencies(plugins))
        .rejects.toThrow('Circular dependency detected');
    });

    it('should handle missing dependencies', async () => {
      const plugins = [
        {
          manifest: {
            name: 'A',
            dependencies: ['NonExistent']
          }
        }
      ] as Plugin[];

      await expect(pluginLoader.resolveDependencies(plugins))
        .rejects.toThrow('Missing dependency: NonExistent');
    });
  });

  describe('plugin initialization', () => {
    let mockPlugin: jest.Mocked<Plugin>;

    beforeEach(() => {
      mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          dependencies: [],
          priority: 1,
          timeout: 5000,
          capabilities: []
        },
        initialize: jest.fn(),
        onEvent: jest.fn(),
        shutdown: jest.fn()
      };
    });

    it('should initialize plugin with context', async () => {
      await pluginLoader.initializePlugin(mockPlugin);

      expect(mockPlugin.initialize).toHaveBeenCalledWith(mockContext);
    });

    it('should handle initialization errors', async () => {
      mockPlugin.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(pluginLoader.initializePlugin(mockPlugin))
        .rejects.toThrow('Plugin initialization failed: test-plugin');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          plugin: 'test-plugin',
          error: 'Init failed'
        }),
        'Plugin initialization error'
      );
    });

    it('should enforce initialization timeout', async () => {
      jest.useFakeTimers();
      
      mockPlugin.initialize.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );
      mockPlugin.manifest.timeout = 100;

      const initPromise = pluginLoader.initializePlugin(mockPlugin);
      
      jest.advanceTimersByTime(101);
      
      await expect(initPromise).rejects.toThrow('initialization timeout');
      
      jest.useRealTimers();
    });
  });

  describe('plugin execution', () => {
    let mockPlugin: jest.Mocked<Plugin>;
    let testEvent: any;

    beforeEach(() => {
      mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          dependencies: [],
          priority: 1,
          timeout: 5000,
          capabilities: []
        },
        initialize: jest.fn(),
        onEvent: jest.fn(),
        shutdown: jest.fn()
      };

      testEvent = {
        id: '123',
        type: 'query',
        timestamp: Date.now(),
        data: { content: 'test' },
        metadata: {
          correlationId: 'abc',
          sessionId: 'session1',
          timestamp: Date.now(),
          source: 'test'
        }
      };

      pluginLoader.registerPlugin(mockPlugin);
    });

    it('should execute plugin onEvent handler', async () => {
      await pluginLoader.executePlugins(testEvent);

      expect(mockPlugin.onEvent).toHaveBeenCalledWith(testEvent, mockContext);
    });

    it('should handle plugin execution errors without affecting others', async () => {
      const mockPlugin2 = { ...mockPlugin, name: 'plugin2' };
      pluginLoader.registerPlugin(mockPlugin2);

      mockPlugin.onEvent.mockRejectedValue(new Error('Plugin error'));
      
      await pluginLoader.executePlugins(testEvent);

      expect(mockPlugin.onEvent).toHaveBeenCalled();
      expect(mockPlugin2.onEvent).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          plugin: 'test-plugin',
          event: testEvent.id
        }),
        'Plugin execution error'
      );
    });

    it('should enforce execution timeout', async () => {
      jest.useFakeTimers();
      
      mockPlugin.onEvent.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );
      mockPlugin.manifest.timeout = 100;

      const executePromise = pluginLoader.executePlugins(testEvent);
      
      jest.advanceTimersByTime(101);
      
      await executePromise;
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          plugin: 'test-plugin',
          timeout: 100
        }),
        'Plugin execution timeout'
      );
      
      jest.useRealTimers();
    });

    it('should execute plugins in priority order', async () => {
      const executionOrder: string[] = [];
      
      const plugin1 = {
        ...mockPlugin,
        name: 'plugin1',
        manifest: { ...mockPlugin.manifest, priority: 2 },
        onEvent: jest.fn(async () => { executionOrder.push('plugin1'); })
      };
      
      const plugin2 = {
        ...mockPlugin,
        name: 'plugin2',
        manifest: { ...mockPlugin.manifest, priority: 1 },
        onEvent: jest.fn(async () => { executionOrder.push('plugin2'); })
      };
      
      pluginLoader.registerPlugin(plugin1);
      pluginLoader.registerPlugin(plugin2);
      
      await pluginLoader.executePlugins(testEvent);
      
      expect(executionOrder).toEqual(['plugin2', 'plugin1']);
    });
  });

  describe('plugin lifecycle', () => {
    it('should shutdown all plugins', async () => {
      const plugin1 = {
        name: 'plugin1',
        shutdown: jest.fn()
      } as unknown as Plugin;
      
      const plugin2 = {
        name: 'plugin2',
        shutdown: jest.fn()
      } as unknown as Plugin;
      
      pluginLoader.registerPlugin(plugin1);
      pluginLoader.registerPlugin(plugin2);
      
      await pluginLoader.shutdown();
      
      expect(plugin1.shutdown).toHaveBeenCalled();
      expect(plugin2.shutdown).toHaveBeenCalled();
    });

    it('should handle shutdown errors gracefully', async () => {
      const plugin = {
        name: 'error-plugin',
        shutdown: jest.fn().mockRejectedValue(new Error('Shutdown failed'))
      } as unknown as Plugin;
      
      pluginLoader.registerPlugin(plugin);
      
      await pluginLoader.shutdown();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          plugin: 'error-plugin',
          error: 'Shutdown failed'
        }),
        'Plugin shutdown error'
      );
    });
  });

  describe('circuit breaker', () => {
    let mockPlugin: jest.Mocked<Plugin>;

    beforeEach(() => {
      mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          dependencies: [],
          priority: 1,
          timeout: 5000,
          capabilities: []
        },
        initialize: jest.fn(),
        onEvent: jest.fn(),
        shutdown: jest.fn()
      };
      
      pluginLoader.registerPlugin(mockPlugin);
    });

    it('should disable plugin after repeated failures', async () => {
      const testEvent = { id: '1', type: 'query' } as any;
      
      // Simulate multiple failures
      mockPlugin.onEvent.mockRejectedValue(new Error('Failed'));
      
      for (let i = 0; i < 5; i++) {
        await pluginLoader.executePlugins(testEvent);
      }
      
      expect(mockPlugin.onEvent).toHaveBeenCalledTimes(5);
      
      // Next execution should skip the plugin
      await pluginLoader.executePlugins(testEvent);
      
      expect(mockPlugin.onEvent).toHaveBeenCalledTimes(5); // Not called again
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          plugin: 'test-plugin'
        }),
        'Plugin disabled due to repeated failures'
      );
    });

    it('should re-enable plugin after cooldown period', async () => {
      jest.useFakeTimers();
      
      // Disable the plugin
      pluginLoader.disablePlugin('test-plugin');
      
      // Fast-forward past cooldown
      jest.advanceTimersByTime(60000); // 1 minute
      
      const testEvent = { id: '1', type: 'query' } as any;
      await pluginLoader.executePlugins(testEvent);
      
      expect(mockPlugin.onEvent).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });
});