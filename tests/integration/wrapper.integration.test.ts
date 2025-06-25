import { spawn } from 'child_process';
import { PassThrough, Readable } from 'stream';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ClaudeWrapper } from '../../src/core/wrapper';
import { Plugin, QueryEvent } from '../../src/types';
import Database from 'better-sqlite3';

describe('Claude Wrapper Integration Tests', () => {
  let wrapper: ClaudeWrapper;
  let tempDir: string;
  let dbPath: string;
  let pluginDir: string;
  
  beforeAll(async () => {
    // Create temporary directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-wrapper-test-'));
    dbPath = path.join(tempDir, 'test.db');
    pluginDir = path.join(tempDir, 'plugins');
    await fs.mkdir(pluginDir);
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    wrapper = new ClaudeWrapper({
      mode: 'development',
      claudePath: '/usr/local/bin/claude-code',
      wrapper: {
        timeout: 30000,
        bufferSize: 65536,
        gracefulShutdownTimeout: 5000
      },
      plugins: {
        directory: pluginDir,
        timeout: 5000,
        retryAttempts: 3
      },
      database: {
        type: 'sqlite',
        path: dbPath,
        batchSize: 10,
        flushInterval: 100,
        walMode: true
      },
      monitoring: {
        enabled: false,
        logLevel: 'error'
      },
      categorization: {
        cacheSize: 100,
        patterns: []
      }
    });
  });

  afterEach(async () => {
    await wrapper.shutdown();
    // Clean database
    try {
      await fs.unlink(dbPath);
    } catch {}
  });

  describe('End-to-End Flow', () => {
    it('should wrap claude-code with zero-latency passthrough', async () => {
      // Mock child process
      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      const outputChunks: Buffer[] = [];
      const outputStream = new PassThrough();
      outputStream.on('data', chunk => outputChunks.push(chunk));

      await wrapper.start(['--version'], process.stdin, outputStream, process.stderr);

      // Simulate claude output
      const testOutput = 'Claude Code v1.0.0\n';
      mockProcess.stdout.write(testOutput);
      mockProcess.stdout.end();

      // Wait for passthrough
      await new Promise(resolve => outputStream.on('end', resolve));

      const output = Buffer.concat(outputChunks).toString();
      expect(output).toBe(testOutput);
    });

    it('should process JSON events without affecting passthrough', async () => {
      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      const collectedEvents: QueryEvent[] = [];
      wrapper.on('event', (event) => collectedEvents.push(event));

      const outputStream = new PassThrough();
      await wrapper.start([], process.stdin, outputStream, process.stderr);

      // Simulate JSON stream from claude
      const jsonEvents = [
        { type: 'query', id: '1', content: 'test query' },
        { type: 'response', id: '2', content: 'test response' }
      ];

      for (const event of jsonEvents) {
        mockProcess.stdout.write(JSON.stringify(event) + '\n');
      }
      mockProcess.stdout.end();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify events were collected
      expect(collectedEvents).toHaveLength(2);
      expect(collectedEvents[0].type).toBe('query');
      expect(collectedEvents[1].type).toBe('response');
    });

    it('should handle partial JSON chunks', async () => {
      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      const collectedEvents: QueryEvent[] = [];
      wrapper.on('event', (event) => collectedEvents.push(event));

      await wrapper.start([], process.stdin, new PassThrough(), process.stderr);

      // Send partial JSON
      mockProcess.stdout.write('{"type":"que');
      mockProcess.stdout.write('ry","id":"1"');
      mockProcess.stdout.write(',"content":"test"}\n');
      mockProcess.stdout.end();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(collectedEvents).toHaveLength(1);
      expect(collectedEvents[0].data).toEqual({
        type: 'query',
        id: '1',
        content: 'test'
      });
    });
  });

  describe('Plugin Integration', () => {
    it('should load and execute plugins', async () => {
      // Create test plugin
      const pluginPath = path.join(pluginDir, 'test-plugin');
      await fs.mkdir(pluginPath);
      
      await fs.writeFile(
        path.join(pluginPath, 'manifest.json'),
        JSON.stringify({
          name: 'test-plugin',
          version: '1.0.0',
          dependencies: [],
          priority: 1,
          timeout: 5000,
          capabilities: ['query-analysis']
        })
      );

      await fs.writeFile(
        path.join(pluginPath, 'index.js'),
        `
        class TestPlugin {
          constructor() {
            this.name = 'test-plugin';
            this.version = '1.0.0';
            this.manifest = require('./manifest.json');
            this.events = [];
          }
          
          async initialize(context) {
            this.context = context;
          }
          
          async onEvent(event, context) {
            this.events.push(event);
            context.eventBus.emit('plugin-processed', event);
          }
          
          async shutdown() {}
        }
        
        module.exports = TestPlugin;
        `
      );

      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      const pluginEvents: any[] = [];
      wrapper.on('plugin-processed', (event) => pluginEvents.push(event));

      await wrapper.start([], process.stdin, new PassThrough(), process.stderr);
      
      // Wait for plugin initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send event
      mockProcess.stdout.write('{"type":"query","id":"1","content":"test"}\n');
      
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(pluginEvents).toHaveLength(1);
    });

    it('should handle plugin errors gracefully', async () => {
      // Create failing plugin
      const pluginPath = path.join(pluginDir, 'error-plugin');
      await fs.mkdir(pluginPath);
      
      await fs.writeFile(
        path.join(pluginPath, 'manifest.json'),
        JSON.stringify({
          name: 'error-plugin',
          version: '1.0.0',
          dependencies: [],
          priority: 1,
          timeout: 5000,
          capabilities: []
        })
      );

      await fs.writeFile(
        path.join(pluginPath, 'index.js'),
        `
        class ErrorPlugin {
          constructor() {
            this.name = 'error-plugin';
            this.version = '1.0.0';
            this.manifest = require('./manifest.json');
          }
          
          async initialize() {
            throw new Error('Plugin initialization failed');
          }
          
          async onEvent() {}
          async shutdown() {}
        }
        
        module.exports = ErrorPlugin;
        `
      );

      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      // Should not throw
      await expect(wrapper.start([], process.stdin, new PassThrough(), process.stderr))
        .resolves.not.toThrow();
    });
  });

  describe('Database Integration', () => {
    it('should persist events to database', async () => {
      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      await wrapper.start([], process.stdin, new PassThrough(), process.stderr);

      // Send events
      const events = [
        { type: 'query', id: '1', content: 'test query 1' },
        { type: 'response', id: '2', content: 'test response 1' },
        { type: 'query', id: '3', content: 'test query 2' }
      ];

      for (const event of events) {
        mockProcess.stdout.write(JSON.stringify(event) + '\n');
      }

      // Wait for batch flush
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify database
      const db = new Database(dbPath);
      const queries = db.prepare('SELECT * FROM queries').all();
      const responses = db.prepare('SELECT * FROM responses').all();
      db.close();

      expect(queries).toHaveLength(2);
      expect(responses).toHaveLength(1);
    });

    it('should handle database errors without affecting passthrough', async () => {
      // Use invalid database path
      wrapper = new ClaudeWrapper({
        ...wrapper.getConfig(),
        database: {
          ...wrapper.getConfig().database,
          path: '/invalid/path/db.sqlite'
        }
      });

      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      const outputStream = new PassThrough();
      const outputChunks: Buffer[] = [];
      outputStream.on('data', chunk => outputChunks.push(chunk));

      await wrapper.start([], process.stdin, outputStream, process.stderr);

      // Send data
      const testOutput = 'Test output\n';
      mockProcess.stdout.write(testOutput);
      mockProcess.stdout.end();

      await new Promise(resolve => outputStream.on('end', resolve));

      // Passthrough should still work
      expect(Buffer.concat(outputChunks).toString()).toBe(testOutput);
    });
  });

  describe('Signal Handling', () => {
    it('should forward signals to child process', async () => {
      const mockProcess = new MockClaudeProcess();
      const killSpy = jest.spyOn(mockProcess, 'kill');
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      await wrapper.start([], process.stdin, new PassThrough(), process.stderr);

      // Simulate SIGINT
      process.emit('SIGINT' as any);

      expect(killSpy).toHaveBeenCalledWith('SIGINT');
    });

    it('should perform graceful shutdown', async () => {
      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      await wrapper.start([], process.stdin, new PassThrough(), process.stderr);

      // Add pending events
      wrapper.emit('event', { type: 'query', id: '1' });

      const shutdownPromise = wrapper.shutdown();
      
      // Simulate process exit
      mockProcess.emit('exit', 0, null);

      await expect(shutdownPromise).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle high-throughput streams', async () => {
      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      const outputStream = new PassThrough();
      let bytesReceived = 0;
      outputStream.on('data', chunk => bytesReceived += chunk.length);

      await wrapper.start([], process.stdin, outputStream, process.stderr);

      const start = Date.now();
      
      // Send 1MB of data
      const chunkSize = 1024;
      const chunks = 1024;
      
      for (let i = 0; i < chunks; i++) {
        mockProcess.stdout.write(Buffer.alloc(chunkSize, 'x'));
      }
      mockProcess.stdout.end();

      await new Promise(resolve => outputStream.on('end', resolve));
      
      const duration = Date.now() - start;
      const throughput = bytesReceived / duration * 1000; // bytes per second

      expect(bytesReceived).toBe(chunkSize * chunks);
      expect(throughput).toBeGreaterThan(10 * 1024 * 1024); // > 10MB/s
    });

    it('should maintain zero-latency with active plugins', async () => {
      // Create compute-intensive plugin
      const pluginPath = path.join(pluginDir, 'heavy-plugin');
      await fs.mkdir(pluginPath);
      
      await fs.writeFile(
        path.join(pluginPath, 'manifest.json'),
        JSON.stringify({
          name: 'heavy-plugin',
          version: '1.0.0',
          dependencies: [],
          priority: 1,
          timeout: 5000,
          capabilities: []
        })
      );

      await fs.writeFile(
        path.join(pluginPath, 'index.js'),
        `
        class HeavyPlugin {
          constructor() {
            this.name = 'heavy-plugin';
            this.version = '1.0.0';
            this.manifest = require('./manifest.json');
          }
          
          async initialize() {}
          
          async onEvent(event) {
            // Simulate heavy computation
            const start = Date.now();
            while (Date.now() - start < 50) {
              // Busy wait
            }
          }
          
          async shutdown() {}
        }
        
        module.exports = HeavyPlugin;
        `
      );

      const mockProcess = new MockClaudeProcess();
      jest.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProcess as any);

      const outputStream = new PassThrough();
      const latencies: number[] = [];

      await wrapper.start([], process.stdin, outputStream, process.stderr);

      // Measure passthrough latency
      for (let i = 0; i < 10; i++) {
        const testData = `Test ${i}\n`;
        const start = Date.now();
        
        mockProcess.stdout.write(testData);
        
        await new Promise(resolve => {
          outputStream.once('data', (chunk) => {
            const latency = Date.now() - start;
            latencies.push(latency);
            resolve(undefined);
          });
        });
      }

      const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
      expect(avgLatency).toBeLessThan(5); // < 5ms average latency
    });
  });
});

// Helper class to mock Claude process
class MockClaudeProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 12345;
  killed = false;

  kill(signal?: string) {
    this.killed = true;
    this.emit('exit', 0, signal);
    return true;
  }
}