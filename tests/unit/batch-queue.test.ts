import { BatchQueue } from '../../src/database/batch-queue';

describe('BatchQueue', () => {
  let batchQueue: BatchQueue<any>;
  let mockHandler: jest.Mock;
  
  beforeEach(() => {
    jest.useFakeTimers();
    mockHandler = jest.fn().mockResolvedValue(undefined);
    batchQueue = new BatchQueue({
      batchSize: 5,
      flushInterval: 1000,
      handler: mockHandler
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    batchQueue.stop();
  });

  describe('batching behavior', () => {
    it('should flush when batch size is reached', async () => {
      const items = [1, 2, 3, 4, 5];
      
      for (const item of items) {
        batchQueue.add(item);
      }

      // Should flush immediately when batch size is reached
      await Promise.resolve(); // Let microtasks run
      
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith(items);
    });

    it('should not flush before batch size is reached', async () => {
      batchQueue.add(1);
      batchQueue.add(2);
      batchQueue.add(3);

      await Promise.resolve();
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(batchQueue.size()).toBe(3);
    });

    it('should flush on interval', async () => {
      batchQueue.add(1);
      batchQueue.add(2);

      expect(mockHandler).not.toHaveBeenCalled();

      // Fast-forward time to trigger interval flush
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith([1, 2]);
    });

    it('should handle multiple batches', async () => {
      // First batch
      for (let i = 1; i <= 5; i++) {
        batchQueue.add(i);
      }
      await Promise.resolve();

      // Second batch
      for (let i = 6; i <= 10; i++) {
        batchQueue.add(i);
      }
      await Promise.resolve();

      expect(mockHandler).toHaveBeenCalledTimes(2);
      expect(mockHandler).toHaveBeenNthCalledWith(1, [1, 2, 3, 4, 5]);
      expect(mockHandler).toHaveBeenNthCalledWith(2, [6, 7, 8, 9, 10]);
    });
  });

  describe('manual flush', () => {
    it('should flush on demand', async () => {
      batchQueue.add(1);
      batchQueue.add(2);

      await batchQueue.flush();

      expect(mockHandler).toHaveBeenCalledWith([1, 2]);
      expect(batchQueue.size()).toBe(0);
    });

    it('should handle empty flush', async () => {
      await batchQueue.flush();

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle concurrent flushes', async () => {
      batchQueue.add(1);
      batchQueue.add(2);

      const flush1 = batchQueue.flush();
      const flush2 = batchQueue.flush();

      await Promise.all([flush1, flush2]);

      // Should only flush once
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith([1, 2]);
    });
  });

  describe('error handling', () => {
    it('should retry on handler error', async () => {
      mockHandler
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined);

      batchQueue = new BatchQueue({
        batchSize: 2,
        flushInterval: 1000,
        handler: mockHandler,
        retryAttempts: 3,
        retryDelay: 100
      });

      batchQueue.add(1);
      batchQueue.add(2);

      await Promise.resolve();
      jest.advanceTimersByTime(100); // Retry delay
      await Promise.resolve();

      expect(mockHandler).toHaveBeenCalledTimes(2);
    });

    it('should emit error after retry exhaustion', async () => {
      mockHandler.mockRejectedValue(new Error('Handler failed'));

      batchQueue = new BatchQueue({
        batchSize: 1,
        flushInterval: 1000,
        handler: mockHandler,
        retryAttempts: 2,
        retryDelay: 10
      });

      const errorHandler = jest.fn();
      batchQueue.on('error', errorHandler);

      batchQueue.add(1);

      // Wait for initial attempt
      await Promise.resolve();
      
      // Wait for retries
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      }

      expect(mockHandler).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(errorHandler).toHaveBeenCalledWith({
        error: expect.any(Error),
        batch: [1],
        attempts: 3
      });
    });

    it('should continue processing after error', async () => {
      mockHandler
        .mockRejectedValueOnce(new Error('Batch 1 failed'))
        .mockResolvedValueOnce(undefined);

      batchQueue = new BatchQueue({
        batchSize: 2,
        flushInterval: 1000,
        handler: mockHandler,
        retryAttempts: 0 // No retries
      });

      const errorHandler = jest.fn();
      batchQueue.on('error', errorHandler);

      // First batch - will fail
      batchQueue.add(1);
      batchQueue.add(2);
      await Promise.resolve();

      // Second batch - should succeed
      batchQueue.add(3);
      batchQueue.add(4);
      await Promise.resolve();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledTimes(2);
      expect(mockHandler).toHaveBeenLastCalledWith([3, 4]);
    });
  });

  describe('backpressure handling', () => {
    it('should apply backpressure when handler is slow', async () => {
      let resolveHandler: Function;
      mockHandler.mockImplementation(() => 
        new Promise(resolve => { resolveHandler = resolve; })
      );

      batchQueue = new BatchQueue({
        batchSize: 2,
        flushInterval: 1000,
        handler: mockHandler,
        maxConcurrent: 1
      });

      // First batch - will block
      batchQueue.add(1);
      batchQueue.add(2);
      await Promise.resolve();

      // Second batch - should queue
      batchQueue.add(3);
      batchQueue.add(4);
      await Promise.resolve();

      expect(mockHandler).toHaveBeenCalledTimes(1);
      
      // Resolve first batch
      resolveHandler!();
      await Promise.resolve();

      // Now second batch should process
      expect(mockHandler).toHaveBeenCalledTimes(2);
    });

    it('should track pending operations', () => {
      mockHandler.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      expect(batchQueue.getPending()).toBe(0);

      batchQueue.add(1);
      batchQueue.add(2);
      batchQueue.add(3);
      batchQueue.add(4);
      batchQueue.add(5);

      expect(batchQueue.getPending()).toBe(5);
    });
  });

  describe('lifecycle management', () => {
    it('should stop interval on stop()', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      batchQueue.stop();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should flush remaining items on stop', async () => {
      batchQueue.add(1);
      batchQueue.add(2);

      await batchQueue.stop();

      expect(mockHandler).toHaveBeenCalledWith([1, 2]);
    });

    it('should reject new items after stop', async () => {
      await batchQueue.stop();

      expect(() => batchQueue.add(1)).toThrow('Queue is stopped');
    });
  });

  describe('metrics', () => {
    it('should track processing metrics', async () => {
      batchQueue.add(1);
      batchQueue.add(2);
      batchQueue.add(3);
      batchQueue.add(4);
      batchQueue.add(5);

      await Promise.resolve();

      const metrics = batchQueue.getMetrics();
      
      expect(metrics.totalItems).toBe(5);
      expect(metrics.totalBatches).toBe(1);
      expect(metrics.failedBatches).toBe(0);
      expect(metrics.averageBatchSize).toBe(5);
    });

    it('should track failed batches', async () => {
      mockHandler.mockRejectedValue(new Error('Failed'));
      
      batchQueue = new BatchQueue({
        batchSize: 2,
        flushInterval: 1000,
        handler: mockHandler,
        retryAttempts: 0
      });

      batchQueue.on('error', () => {}); // Suppress error logs

      batchQueue.add(1);
      batchQueue.add(2);
      await Promise.resolve();

      const metrics = batchQueue.getMetrics();
      expect(metrics.failedBatches).toBe(1);
    });

    it('should calculate average processing time', async () => {
      mockHandler.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      batchQueue.add(1);
      batchQueue.add(2);
      batchQueue.add(3);
      batchQueue.add(4);
      batchQueue.add(5);

      jest.advanceTimersByTime(0);
      await Promise.resolve();
      jest.advanceTimersByTime(50);
      await Promise.resolve();

      const metrics = batchQueue.getMetrics();
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
    });
  });

  describe('configuration validation', () => {
    it('should validate batch size', () => {
      expect(() => new BatchQueue({
        batchSize: 0,
        flushInterval: 1000,
        handler: mockHandler
      })).toThrow('Batch size must be positive');
    });

    it('should validate flush interval', () => {
      expect(() => new BatchQueue({
        batchSize: 10,
        flushInterval: -1,
        handler: mockHandler
      })).toThrow('Flush interval must be positive');
    });

    it('should validate handler function', () => {
      expect(() => new BatchQueue({
        batchSize: 10,
        flushInterval: 1000,
        handler: null as any
      })).toThrow('Handler must be a function');
    });
  });
});