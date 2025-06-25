import { EventEmitter } from 'events';
import { ProcessManager } from '../../src/core/process-manager';

// Mock child_process module
jest.mock('child_process');

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  let mockChildProcess: any;

  beforeEach(() => {
    // Create mock child process
    mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdin = { write: jest.fn(), end: jest.fn() };
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.pid = 12345;
    mockChildProcess.kill = jest.fn().mockReturnValue(true);
    mockChildProcess.killed = false;
    mockChildProcess.exitCode = null;

    const spawn = require('child_process').spawn;
    spawn.mockReturnValue(mockChildProcess);

    processManager = new ProcessManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('spawn', () => {
    it('should spawn child process with correct arguments', () => {
      const spawn = require('child_process').spawn;
      const command = 'claude-code';
      const args = ['--version'];
      const env = { NODE_ENV: 'test' };

      processManager.spawn(command, args, env);

      expect(spawn).toHaveBeenCalledWith(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: expect.objectContaining(env)
      });
    });

    it('should preserve current process environment', () => {
      const spawn = require('child_process').spawn;
      const originalEnv = process.env;

      processManager.spawn('claude-code', []);

      expect(spawn).toHaveBeenCalledWith('claude-code', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: expect.objectContaining(originalEnv)
      });
    });

    it('should handle spawn errors', () => {
      const spawn = require('child_process').spawn;
      const spawnError = new Error('Command not found');
      spawn.mockImplementation(() => {
        throw spawnError;
      });

      expect(() => {
        processManager.spawn('invalid-command', []);
      }).toThrow('Failed to spawn process: Command not found');
    });

    it('should track spawned process', () => {
      processManager.spawn('claude-code', []);
      
      expect(processManager.isRunning()).toBe(true);
      expect(processManager.getPid()).toBe(12345);
    });
  });

  describe('signal handling', () => {
    beforeEach(() => {
      processManager.spawn('claude-code', []);
    });

    it('should forward SIGINT to child process', () => {
      processManager.kill('SIGINT');
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGINT');
    });

    it('should forward SIGTERM to child process', () => {
      processManager.kill('SIGTERM');
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle kill when process already exited', () => {
      mockChildProcess.killed = true;
      mockChildProcess.kill.mockReturnValue(false);

      const result = processManager.kill();
      
      expect(result).toBe(false);
      expect(mockChildProcess.kill).toHaveBeenCalled();
    });

    it('should force kill with SIGKILL after timeout', (done) => {
      jest.useFakeTimers();
      
      processManager.kill('SIGTERM', { forceTimeout: 1000 });
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      // Process doesn't exit, should force kill
      jest.advanceTimersByTime(1001);
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');
      
      jest.useRealTimers();
      done();
    });

    it('should setup signal forwarding from parent process', () => {
      const signalSpy = jest.spyOn(process, 'on');
      
      processManager.setupSignalForwarding();
      
      expect(signalSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(signalSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(signalSpy).toHaveBeenCalledWith('SIGHUP', expect.any(Function));
      
      signalSpy.mockRestore();
    });
  });

  describe('exit handling', () => {
    beforeEach(() => {
      processManager.spawn('claude-code', []);
    });

    it('should emit exit event with code', (done) => {
      processManager.onExit((code, signal) => {
        expect(code).toBe(0);
        expect(signal).toBeNull();
        done();
      });

      mockChildProcess.emit('exit', 0, null);
    });

    it('should emit exit event with signal', (done) => {
      processManager.onExit((code, signal) => {
        expect(code).toBeNull();
        expect(signal).toBe('SIGTERM');
        done();
      });

      mockChildProcess.emit('exit', null, 'SIGTERM');
    });

    it('should handle multiple exit listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      processManager.onExit(listener1);
      processManager.onExit(listener2);

      mockChildProcess.emit('exit', 1, null);

      expect(listener1).toHaveBeenCalledWith(1, null);
      expect(listener2).toHaveBeenCalledWith(1, null);
    });

    it('should clean up on exit', () => {
      mockChildProcess.emit('exit', 0, null);
      
      expect(processManager.isRunning()).toBe(false);
      expect(processManager.getPid()).toBeUndefined();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      processManager.spawn('claude-code', []);
    });

    it('should handle child process errors', (done) => {
      const error = new Error('Process crashed');
      
      processManager.onError((err) => {
        expect(err).toBe(error);
        done();
      });

      mockChildProcess.emit('error', error);
    });

    it('should handle stream errors', (done) => {
      const error = new Error('Stream error');
      
      processManager.onError((err) => {
        expect(err.message).toContain('stdout error');
        done();
      });

      mockChildProcess.stdout.emit('error', error);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      processManager.spawn('claude-code', []);
      
      const removeListenersSpy = jest.spyOn(mockChildProcess, 'removeAllListeners');
      
      processManager.cleanup();
      
      expect(removeListenersSpy).toHaveBeenCalled();
      expect(processManager.isRunning()).toBe(false);
    });

    it('should kill process on cleanup if still running', () => {
      processManager.spawn('claude-code', []);
      
      processManager.cleanup();
      
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should remove signal handlers on cleanup', () => {
      const removeListenerSpy = jest.spyOn(process, 'removeListener');
      
      processManager.setupSignalForwarding();
      processManager.cleanup();
      
      expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      
      removeListenerSpy.mockRestore();
    });
  });

  describe('graceful shutdown', () => {
    it('should perform graceful shutdown sequence', async () => {
      processManager.spawn('claude-code', []);
      
      const shutdownPromise = processManager.gracefulShutdown(1000);
      
      // Simulate process exit
      mockChildProcess.emit('exit', 0, null);
      
      await expect(shutdownPromise).resolves.toEqual({
        code: 0,
        signal: null
      });
    });

    it('should timeout graceful shutdown', async () => {
      jest.useFakeTimers();
      
      processManager.spawn('claude-code', []);
      
      const shutdownPromise = processManager.gracefulShutdown(100);
      
      // Don't emit exit, let it timeout
      jest.advanceTimersByTime(101);
      
      await expect(shutdownPromise).rejects.toThrow('Graceful shutdown timeout');
      
      jest.useRealTimers();
    });
  });
});