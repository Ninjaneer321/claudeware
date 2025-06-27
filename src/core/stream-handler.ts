import { Readable, Writable } from 'stream';
import { EventEmitter } from 'events';
import { JsonStreamParser } from './json-parser';

/**
 * Stream metrics interface
 */
export interface StreamMetrics {
  bytesProcessed: number;
  eventsEmitted: number;
  parseErrors: number;
  backpressureEvents: number;
  latency: number;
}

/**
 * StreamHandler implements zero-latency passthrough with decoupled processing
 *
 * Key features:
 * - Direct pipe for zero-latency passthrough
 * - Separate data listener for JSON parsing
 * - Error isolation - processing errors don't affect passthrough
 * - Metrics tracking for monitoring
 * - Backpressure handling without affecting main stream
 */
export class StreamHandler {
  private metrics: StreamMetrics = {
    bytesProcessed: 0,
    eventsEmitted: 0,
    parseErrors: 0,
    backpressureEvents: 0,
    latency: 0
  };

  private processingListeners: Map<Readable, (...args: any[]) => void> = new Map();
  private errorListeners: Map<Readable, (...args: any[]) => void> = new Map();
  private passthroughStreams: Map<Readable, Writable> = new Map();
  private lastBackpressureCount = 0;
  private readonly BACKPRESSURE_WARNING_THRESHOLD = 10;

  constructor(
    private eventBus: EventEmitter,
    private parser: JsonStreamParser
  ) {}

  /**
   * Setup direct passthrough pipe from source to destination
   * This creates a zero-latency kernel-managed pipe
   *
   * @param source - Readable stream (e.g., child.stdout)
   * @param destination - Writable stream (e.g., process.stdout)
   */
  setupPassthrough(source: Readable, destination: Writable): void {
    // Direct pipe - no processing, no delay
    source.pipe(destination);

    // Track for cleanup
    this.passthroughStreams.set(source, destination);
  }

  /**
   * Setup processing stream with JSON parsing
   * Uses a separate data listener that doesn't affect passthrough
   *
   * @param source - Readable stream to process
   * @param processor - Optional processor stream (for testing)
   */
  setupProcessing(source: Readable, processor?: Writable): void {
    // Create data listener for processing
    const dataListener = (chunk: Buffer | string) => {
      const startTime = Date.now();

      try {
        // Update metrics
        const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        this.metrics.bytesProcessed += chunkSize;

        // Convert chunk to string for parser (JsonStreamParser handles both, but test expects string)
        const chunkStr = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;

        // Parse JSON chunks
        const events = this.parser.parse(chunkStr);

        // Emit parsed events (ensure events is iterable)
        if (events && Array.isArray(events)) {
          for (const event of events) {
            this.eventBus.emit('data', event);
            this.metrics.eventsEmitted++;
          }
        }

        // Update latency metric
        const processingTime = Date.now() - startTime;
        this.metrics.latency = (this.metrics.latency + processingTime) / 2;

        // If processor is provided (for testing), write to it
        if (processor) {
          const canWrite = processor.write(chunk);
          if (!canWrite) {
            this.handleBackpressure();
          }
        }
      } catch (error) {
        this.metrics.parseErrors++;

        // Emit error event with context
        const parseError: any = new Error('Parse error in stream processing');
        parseError.cause = error;
        this.eventBus.emit('error', parseError);
      }
    };

    // Error listener
    const errorListener = (error: Error) => {
      this.eventBus.emit('error', error);
    };

    // Add listeners
    source.on('data', dataListener);
    source.on('error', errorListener);

    // Store for cleanup
    this.processingListeners.set(source, dataListener);
    this.errorListeners.set(source, errorListener);
  }

  /**
   * Handle backpressure events
   * Tracks occurrences and emits warnings at threshold
   */
  handleBackpressure(): void {
    this.metrics.backpressureEvents++;

    // Check if we should emit a warning
    if (this.metrics.backpressureEvents >= this.BACKPRESSURE_WARNING_THRESHOLD &&
        this.metrics.backpressureEvents !== this.lastBackpressureCount) {

      this.lastBackpressureCount = this.metrics.backpressureEvents;

      this.eventBus.emit('backpressure-warning', {
        count: this.metrics.backpressureEvents,
        message: `Processing stream experiencing backpressure (${this.metrics.backpressureEvents} events)`
      });
    }
  }

  /**
   * Get current stream metrics
   */
  getMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  /**
   * Clean up all stream connections and listeners
   */
  cleanup(): void {
    // Unpipe passthrough streams
    this.passthroughStreams.forEach((destination, source) => {
      source.unpipe(destination);
    });

    // Remove data listeners
    this.processingListeners.forEach((listener, source) => {
      source.removeListener('data', listener);
    });

    // Remove error listeners
    this.errorListeners.forEach((listener, source) => {
      source.removeListener('error', listener);
    });

    // Remove all other listeners
    this.processingListeners.forEach((_, source) => {
      source.removeAllListeners();
    });

    // Clear maps
    this.passthroughStreams.clear();
    this.processingListeners.clear();
    this.errorListeners.clear();

    // Reset parser
    this.parser.reset();

    // Reset metrics
    this.metrics = {
      bytesProcessed: 0,
      eventsEmitted: 0,
      parseErrors: 0,
      backpressureEvents: 0,
      latency: 0
    };
  }
}