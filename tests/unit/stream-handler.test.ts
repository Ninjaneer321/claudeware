import { PassThrough } from 'stream';
import { EventEmitter } from 'events';
import { StreamHandler } from '../../src/core/stream-handler';
import { JsonStreamParser } from '../../src/core/json-parser';

describe('StreamHandler', () => {
  let streamHandler: StreamHandler;
  let mockEventBus: EventEmitter;
  let mockParser: jest.Mocked<JsonStreamParser>;

  beforeEach(() => {
    mockEventBus = new EventEmitter();
    mockParser = {
      parse: jest.fn(),
      reset: jest.fn(),
      getBuffer: jest.fn()
    } as unknown as jest.Mocked<JsonStreamParser>;
    streamHandler = new StreamHandler(mockEventBus, mockParser);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setupPassthrough', () => {
    it('should pipe source directly to destination without processing', (done) => {
      const source = new PassThrough();
      const destination = new PassThrough();
      const chunks: Buffer[] = [];

      destination.on('data', (chunk) => chunks.push(chunk));
      destination.on('end', () => {
        const result = Buffer.concat(chunks).toString();
        expect(result).toBe('test data');
        expect(mockParser.parse).not.toHaveBeenCalled();
        done();
      });

      streamHandler.setupPassthrough(source, destination);
      
      source.write('test data');
      source.end();
    });

    it('should not affect passthrough when processing stream has backpressure', (done) => {
      const source = new PassThrough();
      const destination = new PassThrough();
      const slowProcessor = new PassThrough({ highWaterMark: 1 });
      
      // Pause the slow processor to simulate backpressure
      slowProcessor.pause();

      const passthroughChunks: string[] = [];
      destination.on('data', (chunk) => passthroughChunks.push(chunk.toString()));
      destination.on('end', () => {
        expect(passthroughChunks.join('')).toBe('fast data stream');
        done();
      });

      streamHandler.setupPassthrough(source, destination);
      streamHandler.setupProcessing(source, slowProcessor);

      // Write data that would cause backpressure
      source.write('fast ');
      source.write('data ');
      source.write('stream');
      source.end();
    });
  });

  describe('setupProcessing', () => {
    it('should parse JSON chunks and emit events', (done) => {
      const source = new PassThrough();
      const testData = { type: 'query', content: 'test' };
      
      mockParser.parse.mockReturnValue([testData]);
      
      mockEventBus.once('data', (event) => {
        expect(event).toEqual(testData);
        expect(mockParser.parse).toHaveBeenCalledWith(JSON.stringify(testData));
        done();
      });

      streamHandler.setupProcessing(source);
      source.write(JSON.stringify(testData));
    });

    it('should handle partial JSON chunks', (done) => {
      const source = new PassThrough();
      const chunk1 = '{"type":"que';
      const chunk2 = 'ry","content":"test"}';
      
      mockParser.parse
        .mockReturnValueOnce([]) // First chunk incomplete
        .mockReturnValueOnce([{ type: 'query', content: 'test' }]);

      let eventCount = 0;
      mockEventBus.on('data', () => {
        eventCount++;
        if (eventCount === 1) {
          expect(mockParser.parse).toHaveBeenCalledTimes(2);
          done();
        }
      });

      streamHandler.setupProcessing(source);
      source.write(chunk1);
      source.write(chunk2);
    });

    it('should emit parse errors without crashing', (done) => {
      const source = new PassThrough();
      const error = new Error('Invalid JSON');
      
      mockParser.parse.mockImplementation(() => {
        throw error;
      });

      mockEventBus.once('error', (err) => {
        expect(err.message).toContain('Parse error');
        expect(err.cause).toBe(error);
        done();
      });

      streamHandler.setupProcessing(source);
      source.write('invalid json{');
    });

    it('should handle stream errors gracefully', (done) => {
      const source = new PassThrough();
      const testError = new Error('Stream error');

      mockEventBus.once('error', (err) => {
        expect(err).toBe(testError);
        done();
      });

      streamHandler.setupProcessing(source);
      source.emit('error', testError);
    });
  });

  describe('handleBackpressure', () => {
    it('should track backpressure metrics', () => {
      const metrics = streamHandler.getMetrics();
      expect(metrics.backpressureEvents).toBe(0);

      streamHandler.handleBackpressure();
      
      const updatedMetrics = streamHandler.getMetrics();
      expect(updatedMetrics.backpressureEvents).toBe(1);
    });

    it('should emit backpressure warning after threshold', () => {
      const warningSpy = jest.fn();
      mockEventBus.on('backpressure-warning', warningSpy);

      // Simulate multiple backpressure events
      for (let i = 0; i < 10; i++) {
        streamHandler.handleBackpressure();
      }

      expect(warningSpy).toHaveBeenCalledWith({
        count: 10,
        message: expect.stringContaining('backpressure')
      });
    });
  });

  describe('metrics', () => {
    it('should track bytes processed', (done) => {
      const source = new PassThrough();
      const data = 'test data';
      
      mockParser.parse.mockReturnValue([{ type: 'test' }]);

      streamHandler.setupProcessing(source);
      source.write(data);
      
      setImmediate(() => {
        const metrics = streamHandler.getMetrics();
        expect(metrics.bytesProcessed).toBe(data.length);
        expect(metrics.eventsEmitted).toBe(1);
        done();
      });
    });

    it('should track parse errors in metrics', (done) => {
      const source = new PassThrough();
      
      mockParser.parse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      mockEventBus.on('error', () => {
        const metrics = streamHandler.getMetrics();
        expect(metrics.parseErrors).toBe(1);
        done();
      });

      streamHandler.setupProcessing(source);
      source.write('invalid');
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on shutdown', () => {
      const source = new PassThrough();
      const destination = new PassThrough();

      streamHandler.setupPassthrough(source, destination);
      streamHandler.setupProcessing(source);

      const unpipeSpy = jest.spyOn(source, 'unpipe');
      const removeListenersSpy = jest.spyOn(source, 'removeAllListeners');

      streamHandler.cleanup();

      expect(unpipeSpy).toHaveBeenCalled();
      expect(removeListenersSpy).toHaveBeenCalled();
      expect(mockParser.reset).toHaveBeenCalled();
    });
  });
});