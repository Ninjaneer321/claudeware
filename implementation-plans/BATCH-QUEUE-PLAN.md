# Batch Queue Implementation Plan

## Component Overview
A generic batching utility that accumulates items and flushes them based on size or time intervals, with retry logic and backpressure handling.

## Key Requirements
- Automatic flush on batch size reached
- Time-based flush on interval
- Manual flush capability
- Retry failed batches with exponential backoff
- Backpressure handling for slow consumers
- Graceful shutdown with drain

## Implementation Details

### Core Algorithm
1. **Batching Logic**
   - Internal queue array for accumulation
   - Flush triggers: size limit OR time interval
   - Concurrent flush limiting

2. **Timer Management**
   - Single interval timer for time-based flush
   - Clear timer on stop()
   - Reset timer after each flush

3. **Retry Mechanism**
   - Exponential backoff: 100ms, 200ms, 400ms...
   - Max retry attempts configurable
   - Emit error event after exhaustion

4. **Backpressure Strategy**
   - Track pending flush operations
   - Queue flushes if at max concurrent
   - Reject adds if stopped

### API Design
```typescript
class BatchQueue<T> extends EventEmitter {
  private queue: T[] = [];
  private flushTimer?: NodeJS.Timer;
  private pendingFlushes: number = 0;
  private stopped: boolean = false;
  private metrics: BatchMetrics;

  constructor(options: BatchQueueOptions<T>);
  add(item: T): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
  size(): number;
  getPending(): number;
  getMetrics(): BatchMetrics;
}

interface BatchQueueOptions<T> {
  batchSize: number;
  flushInterval: number;
  handler: (batch: T[]) => Promise<void>;
  retryAttempts?: number;
  retryDelay?: number;
  maxConcurrent?: number;
  onError?: (error: Error, batch: T[]) => void;
}
```

### Error Handling
- Wrap handler calls in try-catch
- Implement retry with backoff
- Emit 'error' event with context
- Continue processing after errors
- Track failed batches in metrics

### Performance Considerations
- Pre-allocate arrays where possible
- Use array.splice(0) for clearing
- Avoid unnecessary array copies
- Track metrics efficiently

## Test Coverage Focus
- Batch size triggering
- Interval-based flushing
- Manual flush behavior
- Concurrent flush handling
- Retry logic with failures
- Backpressure scenarios
- Graceful shutdown
- Metrics accuracy
- Edge cases (empty flush, stop during flush)

## Success Criteria
- All 65 test cases pass
- Handle 10,000 items/second throughput
- Retry logic recovers from transient failures
- Zero data loss during shutdown
- Memory usage remains constant
- Accurate metrics reporting