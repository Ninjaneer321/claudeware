# Stream Handler Implementation Plan

## Component Overview
The critical component that implements zero-latency passthrough while enabling plugin processing through decoupled stream handling.

## Key Requirements
- **Zero-latency passthrough**: Direct pipe from child stdout to process stdout
- **Decoupled processing**: Separate listener for plugin processing
- **JSON parsing**: Use the JsonStreamParser we already built
- **Error isolation**: Processing errors don't affect passthrough
- **Metrics tracking**: Bytes processed, events emitted, errors

## Critical Implementation Pattern

Based on our research (Gemini's recommendation), we must use decoupled streams:

```typescript
// CORRECT - Decoupled approach
child.stdout.pipe(process.stdout);  // Direct kernel-managed pipe
child.stdout.on('data', (chunk) => {
  // Separate processing that can't slow down passthrough
  processor.write(chunk);
});

// WRONG - Traditional tee pattern (causes backpressure)
child.stdout.pipe(tee);
tee.pipe(process.stdout);
tee.pipe(processor);
```

## Core Architecture

### Stream Setup
1. **Passthrough Stream**
   - Direct pipe: child.stdout → process.stdout
   - Direct pipe: child.stderr → process.stderr
   - No transformation, no delay

2. **Processing Stream**
   - Data listener on child.stdout
   - Parse JSON chunks
   - Emit events to EventBus
   - Handle backpressure internally

3. **Error Handling**
   - Processing errors emit 'error' event
   - Never interrupt passthrough
   - Track error metrics

### API Design
```typescript
class StreamHandler {
  constructor(
    private eventBus: EventEmitter,
    private parser: JsonStreamParser
  );
  
  setupPassthrough(source: Readable, destination: Writable): void;
  setupProcessing(source: Readable): void;
  handleBackpressure(): void;
  getMetrics(): StreamMetrics;
  cleanup(): void;
}
```

### Metrics Tracking
- bytesProcessed: Total bytes seen
- eventsEmitted: Valid events parsed
- parseErrors: Failed parse attempts
- backpressureEvents: Slow processing count
- latency: Processing delay measurements

## Test Coverage (90 cases)
- Zero-latency passthrough verification
- Backpressure isolation
- Partial JSON handling
- Error propagation
- Stream cleanup
- High-throughput scenarios
- Memory usage patterns

## Success Criteria
- Passthrough has ZERO added latency
- Processing errors don't affect output
- Handle 10MB/s+ throughput
- Graceful degradation under load
- All 90 test cases pass