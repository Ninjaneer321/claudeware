import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';

interface KillOptions {
  forceTimeout?: number;
}

type ExitCallback = (code: number | null, signal: NodeJS.Signals | null) => void;
type ErrorCallback = (error: Error) => void;

export class ProcessManager extends EventEmitter {
  private childProcess?: ChildProcess;
  private signalHandlers: Map<string, (...args: any[]) => void> = new Map();
  private exitCallbacks: ExitCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private forceKillTimer?: NodeJS.Timeout;

  spawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess {
    try {
      // Spawn child process with proper configuration
      this.childProcess = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env }
      });

      // Setup event handlers
      this.setupProcessEventHandlers();

      return this.childProcess;
    } catch (error) {
      throw new Error(`Failed to spawn process: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  kill(signal: NodeJS.Signals = 'SIGTERM', options?: KillOptions): boolean {
    if (!this.childProcess) {
      return false;
    }

    // Clear any existing force kill timer
    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer);
      this.forceKillTimer = undefined;
    }

    // Try to kill the process
    const killed = this.childProcess.kill(signal);

    // Setup force kill timeout if requested
    if (options?.forceTimeout && killed && signal !== 'SIGKILL') {
      this.forceKillTimer = setTimeout(() => {
        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill('SIGKILL');
        }
      }, options.forceTimeout);
    }

    return killed;
  }

  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  setupSignalForwarding(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

    signals.forEach(signal => {
      const handler = () => {
        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill(signal);
        }
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    });
  }

  isRunning(): boolean {
    return this.childProcess !== undefined &&
           this.childProcess.killed === false &&
           this.childProcess.exitCode === null;
  }

  getPid(): number | undefined {
    return this.childProcess?.pid;
  }

  async gracefulShutdown(timeout: number): Promise<{ code: number | null, signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
      if (!this.childProcess) {
        resolve({ code: 0, signal: null });
        return;
      }

      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Graceful shutdown timeout'));
        }
      }, timeout);

      // Listen for exit
      const exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve({ code, signal });
        }
      };

      this.childProcess.once('exit', exitHandler);

      // Send SIGTERM
      this.kill('SIGTERM');
    });
  }

  cleanup(): void {
    // Clear force kill timer
    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer);
      this.forceKillTimer = undefined;
    }

    // Kill process if still running
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
    }

    // Remove all event listeners from child process
    if (this.childProcess) {
      this.childProcess.removeAllListeners();
    }

    // Remove signal handlers from parent process
    this.signalHandlers.forEach((handler, signal) => {
      process.removeListener(signal, handler);
    });
    this.signalHandlers.clear();

    // Clear internal state
    this.childProcess = undefined;
    this.exitCallbacks = [];
    this.errorCallbacks = [];
  }

  private setupProcessEventHandlers(): void {
    if (!this.childProcess) {
      return;
    }

    // Handle process exit
    this.childProcess.on('exit', (code, signal) => {
      // Clear force kill timer
      if (this.forceKillTimer) {
        clearTimeout(this.forceKillTimer);
        this.forceKillTimer = undefined;
      }

      // Notify all exit callbacks
      this.exitCallbacks.forEach(callback => {
        callback(code, signal);
      });

      // Clean up process reference
      this.childProcess = undefined;
    });

    // Handle process errors
    this.childProcess.on('error', (error) => {
      this.notifyError(error);
    });

    // Handle stream errors
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('error', (error) => {
        this.notifyError(new Error(`stdout error: ${error.message}`));
      });
    }

    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('error', (error) => {
        this.notifyError(new Error(`stderr error: ${error.message}`));
      });
    }
  }

  private notifyError(error: Error): void {
    this.errorCallbacks.forEach(callback => {
      callback(error);
    });
  }
}