# Process Manager Implementation Plan

## Component Overview
Manages the lifecycle of the claude-code child process, including spawning, signal forwarding, and graceful shutdown.

## Key Requirements
- Spawn claude-code process with proper stdio configuration
- Forward signals (SIGINT, SIGTERM, SIGHUP) to child
- Track process state (running, pid, exit code)
- Graceful shutdown with timeout
- Environment variable preservation
- Working directory handling

## Implementation Details

### Process Spawning
```typescript
spawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess {
  return child_process.spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    cwd: process.cwd()
  });
}
```

### Signal Handling
1. **Signal Forwarding**
   - Listen for signals on parent process
   - Forward to child process
   - Remove listeners on cleanup

2. **Supported Signals**
   - SIGINT (Ctrl+C)
   - SIGTERM (termination)
   - SIGHUP (hangup)

3. **Force Kill**
   - Timeout after graceful attempt
   - SIGKILL as last resort

### Process State Management
- Track spawned process reference
- Monitor pid and running state
- Handle exit codes and signals
- Emit exit events

### API Design
```typescript
class ProcessManager {
  private childProcess?: ChildProcess;
  private signalHandlers: Map<string, Function>;
  
  spawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess;
  kill(signal?: NodeJS.Signals, options?: { forceTimeout?: number }): boolean;
  onExit(callback: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  onError(callback: (error: Error) => void): void;
  setupSignalForwarding(): void;
  isRunning(): boolean;
  getPid(): number | undefined;
  gracefulShutdown(timeout: number): Promise<{ code: number | null, signal: NodeJS.Signals | null }>;
  cleanup(): void;
}
```

### Error Handling
- Spawn errors (command not found)
- Stream errors from stdout/stderr
- Process crash handling
- Zombie process prevention

### Lifecycle Events
- 'spawn': Process started
- 'exit': Process terminated
- 'error': Process or stream error
- 'signal': Signal received

## Test Coverage (60 cases)
- Spawn with various arguments
- Signal forwarding verification
- Graceful shutdown timeout
- Force kill behavior
- Environment preservation
- Working directory handling
- Error scenarios
- Cleanup verification

## Success Criteria
- Reliable process spawning
- All signals properly forwarded
- Clean shutdown in all scenarios
- No zombie processes
- All 60 test cases pass