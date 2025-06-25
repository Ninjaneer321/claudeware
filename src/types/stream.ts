import { ChildProcess } from 'child_process';
import { Transform, Readable, Writable } from 'stream';

export interface StreamConfig {
  highWaterMark: number;
  encoding?: BufferEncoding;
  parseTimeout: number;
}

export interface ProcessManager {
  spawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess;
  kill(signal?: NodeJS.Signals): void;
  onExit(callback: (code: number | null, signal: NodeJS.Signals | null) => void): void;
}

export interface StreamHandler {
  setupPassthrough(source: Readable, destination: Writable): void;
  setupProcessing(source: Readable, processor: Transform): void;
  handleBackpressure(): void;
}

export interface JsonStreamParser {
  parse(chunk: Buffer | string): Array<any>;
  reset(): void;
  getBuffer(): string;
}

export interface StreamMetrics {
  bytesProcessed: number;
  eventsEmitted: number;
  parseErrors: number;
  backpressureEvents: number;
  latency: number;
}