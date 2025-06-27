import { EventEmitter } from 'events';

/**
 * Options for configuring the BatchQueue
 */
export interface BatchQueueOptions<T> {
  batchSize: number;
  flushInterval: number;
  handler: (batch: T[]) => Promise<void>;
  retryAttempts?: number;
  retryDelay?: number;
  maxConcurrent?: number;
  onError?: (error: Error, batch: T[]) => void;
}

/**
 * Metrics for tracking BatchQueue performance
 */
export interface BatchMetrics {
  totalItems: number;
  totalBatches: number;
  failedBatches: number;
  averageBatchSize: number;
  averageProcessingTime: number;
}

// Timer functions interface for testing
interface TimerFunctions {
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
  setTimeout: typeof globalThis.setTimeout;
}

// Default timer functions
const defaultTimers: TimerFunctions = {
  setInterval: global.setInterval,
  clearInterval: global.clearInterval,
  setTimeout: global.setTimeout
};

/**
 * A generic batching utility that accumulates items and flushes them
 * based on size or time intervals, with retry logic and backpressure handling.
 */
export class BatchQueue<T> extends EventEmitter {
  private queue: T[] = [];
  private flushTimer?: NodeJS.Timeout;
  private pendingFlushes: number = 0;
  private stopped: boolean = false;
  private metrics: BatchMetrics;
  private isFlushScheduled: boolean = false;
  private flushPromises: Promise<void>[] = [];
  private timers: TimerFunctions;

  private readonly options: Required<BatchQueueOptions<T>>;

  constructor(options: BatchQueueOptions<T>) {
    super();

    // Validate configuration
    this.validateOptions(options);

    // Set defaults for optional parameters
    this.options = {
      ...options,
      retryAttempts: options.retryAttempts ?? 3,
      retryDelay: options.retryDelay ?? 100,
      maxConcurrent: options.maxConcurrent ?? Infinity,
      onError: options.onError ?? (() => {})
    };

    // Initialize metrics
    this.metrics = {
      totalItems: 0,
      totalBatches: 0,
      failedBatches: 0,
      averageBatchSize: 0,
      averageProcessingTime: 0
    };

    // Use default timers (can be overridden for testing)
    this.timers = defaultTimers;

    // Start the flush interval timer
    this.startTimer();
  }

  /**
   * Validates the configuration options
   */
  private validateOptions(options: BatchQueueOptions<T>): void {
    if (options.batchSize <= 0) {
      throw new Error('Batch size must be positive');
    }

    if (options.flushInterval <= 0) {
      throw new Error('Flush interval must be positive');
    }

    if (typeof options.handler !== 'function') {
      throw new Error('Handler must be a function');
    }
  }

  /**
   * Starts the interval timer for time-based flushes
   */
  private startTimer(): void {
    this.flushTimer = this.timers.setInterval(() => {
      if (this.queue.length > 0 && !this.stopped) {
        this.scheduleFlush();
      }
    }, this.options.flushInterval);
  }

  /**
   * Adds an item to the queue
   */
  add(item: T): void {
    if (this.stopped) {
      throw new Error('Queue is stopped');
    }

    this.queue.push(item);
    this.metrics.totalItems++;

    // Check if we should flush based on batch size
    if (this.queue.length >= this.options.batchSize) {
      this.scheduleFlush();
    }
  }

  /**
   * Schedules a flush operation
   */
  private scheduleFlush(): void {
    if (this.isFlushScheduled || this.stopped) {
      return;
    }

    this.isFlushScheduled = true;

    // Use Promise.resolve() to schedule flush in next microtask
    Promise.resolve().then(() => {
      this.isFlushScheduled = false;
      if (!this.stopped) {
        const flushPromise = this.doFlush();
        this.flushPromises.push(flushPromise);
        flushPromise.finally(() => {
          const index = this.flushPromises.indexOf(flushPromise);
          if (index > -1) {
            this.flushPromises.splice(index, 1);
          }
        });
      }
    });
  }

  /**
   * Performs the actual flush operation
   */
  private async doFlush(): Promise<void> {
    // Check concurrent limit
    if (this.pendingFlushes >= this.options.maxConcurrent) {
      return;
    }

    // Get items to flush
    const batch = this.queue.splice(0, Math.min(this.queue.length, this.options.batchSize));

    if (batch.length === 0) {
      return;
    }

    this.pendingFlushes++;
    const startTime = Date.now();

    try {
      await this.executeBatchWithRetry(batch);

      // Update metrics
      this.metrics.totalBatches++;
      const processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(processingTime);
      this.updateAverageBatchSize(batch.length);

    } catch (error) {
      this.metrics.failedBatches++;

      // Emit error event
      this.emit('error', {
        error,
        batch,
        attempts: this.options.retryAttempts + 1
      });

      // Call onError callback
      this.options.onError(error as Error, batch);
    } finally {
      this.pendingFlushes--;

      // If there are more items to flush and we're below the concurrent limit
      if (this.queue.length > 0 && this.pendingFlushes < this.options.maxConcurrent && !this.stopped) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * Executes a batch with retry logic
   */
  private async executeBatchWithRetry(batch: T[]): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.retryAttempts; attempt++) {
      try {
        await this.options.handler(batch);
        return; // Success
      } catch (error) {
        lastError = error as Error;

        // If this isn't the last attempt, wait before retrying
        if (attempt < this.options.retryAttempts) {
          const delay = this.options.retryDelay * Math.pow(2, attempt);
          await this.delay(delay);
        }
      }
    }

    // All attempts failed
    throw lastError;
  }

  /**
   * Helper method to create a delay that works with Jest fake timers
   */
  private delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.timers.setTimeout(resolve, ms);
    });
  }

  /**
   * Manually flushes the queue
   */
  async flush(): Promise<void> {
    // Wait for any scheduled flushes
    await Promise.all(this.flushPromises);

    // If queue is empty after pending flush, we're done
    if (this.queue.length === 0) {
      return;
    }

    // Flush all remaining items
    await this.flushAll();
  }

  /**
   * Flushes all items in the queue
   */
  private async flushAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    while (this.queue.length > 0) {
      const flushPromise = this.doFlush();
      promises.push(flushPromise);

      // If we're at max concurrent, wait for one to complete
      if (promises.length >= this.options.maxConcurrent) {
        await Promise.race(promises);
        // Remove completed promises
        for (let i = promises.length - 1; i >= 0; i--) {
          if (await Promise.race([promises[i], Promise.resolve('pending')]) !== 'pending') {
            promises.splice(i, 1);
          }
        }
      }
    }

    // Wait for all remaining promises
    await Promise.all(promises);
  }

  /**
   * Stops the queue and flushes remaining items
   */
  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;

    // Clear the interval timer
    if (this.flushTimer) {
      this.timers.clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush remaining items
    await this.flushAll();
  }

  /**
   * Gets the current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Gets the number of pending items (including those being processed)
   */
  getPending(): number {
    return this.queue.length;
  }

  /**
   * Gets the current metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Updates the average processing time metric
   */
  private updateAverageProcessingTime(processingTime: number): void {
    if (this.metrics.totalBatches === 1) {
      this.metrics.averageProcessingTime = processingTime;
    } else {
      const totalTime = this.metrics.averageProcessingTime * (this.metrics.totalBatches - 1);
      this.metrics.averageProcessingTime = (totalTime + processingTime) / this.metrics.totalBatches;
    }
  }

  /**
   * Updates the average batch size metric
   */
  private updateAverageBatchSize(batchSize: number): void {
    if (this.metrics.totalBatches === 1) {
      this.metrics.averageBatchSize = batchSize;
    } else {
      const totalSize = this.metrics.averageBatchSize * (this.metrics.totalBatches - 1);
      this.metrics.averageBatchSize = (totalSize + batchSize) / this.metrics.totalBatches;
    }
  }
}