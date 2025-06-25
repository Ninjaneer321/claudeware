import { EventBus } from '../../src/plugins/event-bus';
import { QueryEvent } from '../../src/types';

describe('EventBus', () => {
  let eventBus: EventBus;
  let testEvent: QueryEvent;

  beforeEach(() => {
    eventBus = new EventBus();
    testEvent = {
      id: '123',
      type: 'query',
      timestamp: Date.now(),
      data: { content: 'test query' },
      metadata: {
        correlationId: 'corr-123',
        sessionId: 'session-456',
        timestamp: Date.now(),
        source: 'test'
      }
    };
  });

  describe('event emission', () => {
    it('should emit events to registered listeners', (done) => {
      eventBus.on('query', (event: QueryEvent) => {
        expect(event).toEqual(testEvent);
        done();
      });

      eventBus.emitEvent(testEvent);
    });

    it('should emit to multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('query', listener1);
      eventBus.on('query', listener2);

      eventBus.emitEvent(testEvent);

      expect(listener1).toHaveBeenCalledWith(testEvent);
      expect(listener2).toHaveBeenCalledWith(testEvent);
    });

    it('should emit wildcard events for all event types', () => {
      const wildcardListener = jest.fn();
      const queryListener = jest.fn();

      eventBus.on('*', wildcardListener);
      eventBus.on('query', queryListener);

      eventBus.emitEvent(testEvent);

      expect(wildcardListener).toHaveBeenCalledWith(testEvent);
      expect(queryListener).toHaveBeenCalledWith(testEvent);
    });

    it('should handle async listeners', async () => {
      const results: string[] = [];
      
      eventBus.on('query', async (_event: QueryEvent) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('async1');
      });

      eventBus.on('query', async (_event: QueryEvent) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        results.push('async2');
      });

      await eventBus.emitEventAsync(testEvent);

      // Both should complete despite different timings
      expect(results).toContain('async1');
      expect(results).toContain('async2');
    });
  });

  describe('error handling', () => {
    it('should catch and emit listener errors', (done) => {
      const error = new Error('Listener error');
      
      eventBus.on('error', (err: any) => {
        expect(err.message).toContain('Event listener error');
        expect(err.cause).toBe(error);
        expect(err.eventType).toBe('query');
        done();
      });

      eventBus.on('query', () => {
        throw error;
      });

      eventBus.emitEvent(testEvent);
    });

    it('should continue emitting to other listeners after error', () => {
      const listener1 = jest.fn(() => { throw new Error('Failed'); });
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      // Add error handler to prevent unhandled error
      eventBus.on('error', () => {});

      eventBus.on('query', listener1);
      eventBus.on('query', listener2);
      eventBus.on('query', listener3);

      eventBus.emitEvent(testEvent);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    it('should handle async listener errors', async () => {
      const errorHandler = jest.fn();
      eventBus.on('error', errorHandler);

      eventBus.on('query', async () => {
        throw new Error('Async error');
      });

      await eventBus.emitEventAsync(testEvent);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Event listener error'),
          eventType: 'query'
        })
      );
    });
  });

  describe('listener management', () => {
    it('should remove listeners', () => {
      const listener = jest.fn();
      
      eventBus.on('query', listener);
      eventBus.emitEvent(testEvent);
      expect(listener).toHaveBeenCalledTimes(1);

      eventBus.off('query', listener);
      eventBus.emitEvent(testEvent);
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should remove all listeners for an event type', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('query', listener1);
      eventBus.on('query', listener2);
      
      eventBus.removeAllListeners('query');
      eventBus.emitEvent(testEvent);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should support once listeners', () => {
      const listener = jest.fn();
      
      eventBus.once('query', listener);
      
      eventBus.emitEvent(testEvent);
      eventBus.emitEvent(testEvent);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should count listeners', () => {
      expect(eventBus.listenerCount('query')).toBe(0);

      eventBus.on('query', () => {});
      eventBus.on('query', () => {});
      
      expect(eventBus.listenerCount('query')).toBe(2);
    });
  });

  describe('event filtering', () => {
    it('should support event filters', () => {
      const highPriorityListener = jest.fn();
      
      eventBus.on('query', highPriorityListener, {
        filter: (event) => event.data?.priority === 'high'
      });

      eventBus.emitEvent({ ...testEvent, data: { priority: 'low' } });
      expect(highPriorityListener).not.toHaveBeenCalled();

      eventBus.emitEvent({ ...testEvent, data: { priority: 'high' } });
      expect(highPriorityListener).toHaveBeenCalled();
    });

    it('should support metadata filters', () => {
      const sessionListener = jest.fn();
      
      eventBus.on('*', sessionListener, {
        filter: (event) => event.metadata.sessionId === 'specific-session'
      });

      eventBus.emitEvent(testEvent);
      expect(sessionListener).not.toHaveBeenCalled();

      eventBus.emitEvent({
        ...testEvent,
        metadata: { ...testEvent.metadata, sessionId: 'specific-session' }
      });
      expect(sessionListener).toHaveBeenCalled();
    });
  });

  describe('event replay', () => {
    it('should store recent events for replay', () => {
      eventBus.enableReplay(10);

      for (let i = 0; i < 5; i++) {
        eventBus.emitEvent({ ...testEvent, id: `event-${i}` });
      }

      const recentEvents = eventBus.getRecentEvents();
      expect(recentEvents).toHaveLength(5);
      expect(recentEvents[0].id).toBe('event-0');
      expect(recentEvents[4].id).toBe('event-4');
    });

    it('should limit stored events to buffer size', () => {
      eventBus.enableReplay(3);

      for (let i = 0; i < 5; i++) {
        eventBus.emitEvent({ ...testEvent, id: `event-${i}` });
      }

      const recentEvents = eventBus.getRecentEvents();
      expect(recentEvents).toHaveLength(3);
      expect(recentEvents[0].id).toBe('event-2'); // Oldest kept
      expect(recentEvents[2].id).toBe('event-4'); // Newest
    });

    it('should replay events to new listeners', () => {
      eventBus.enableReplay(5);

      // Emit some events
      eventBus.emitEvent({ ...testEvent, id: 'event-1' });
      eventBus.emitEvent({ ...testEvent, id: 'event-2' });

      // Add listener with replay
      const listener = jest.fn();
      eventBus.on('query', listener, { replay: true });

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event-1' })
      );
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event-2' })
      );
    });
  });

  describe('performance', () => {
    it('should handle high-frequency events', () => {
      const listener = jest.fn();
      eventBus.on('query', listener);

      const start = Date.now();
      const eventCount = 10000;

      for (let i = 0; i < eventCount; i++) {
        eventBus.emitEvent({ ...testEvent, id: `event-${i}` });
      }

      const duration = Date.now() - start;
      
      expect(listener).toHaveBeenCalledTimes(eventCount);
      expect(duration).toBeLessThan(100); // Should process 10k events in < 100ms
    });

    it('should handle many listeners efficiently', () => {
      const listenerCount = 100;
      const listeners = Array(listenerCount).fill(null).map(() => jest.fn());
      
      listeners.forEach(listener => eventBus.on('query', listener));

      const start = Date.now();
      eventBus.emitEvent(testEvent);
      const duration = Date.now() - start;

      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledWith(testEvent);
      });
      
      expect(duration).toBeLessThan(10); // Should notify 100 listeners in < 10ms
    });
  });

  describe('metrics', () => {
    it('should track event metrics', () => {
      eventBus.on('query', () => {});
      eventBus.on('response', () => {});

      eventBus.emitEvent(testEvent);
      eventBus.emitEvent({ ...testEvent, type: 'response' });
      eventBus.emitEvent(testEvent);

      const metrics = eventBus.getMetrics();
      
      expect(metrics.totalEvents).toBe(3);
      expect(metrics.eventCounts.query).toBe(2);
      expect(metrics.eventCounts.response).toBe(1);
      expect(metrics.listenerCounts.query).toBe(1);
      expect(metrics.listenerCounts.response).toBe(1);
    });

    it('should track error metrics', () => {
      // Add error handler to prevent unhandled error
      eventBus.on('error', () => {});
      
      eventBus.on('query', () => { throw new Error('Test error'); });
      
      eventBus.emitEvent(testEvent);
      eventBus.emitEvent(testEvent);

      const metrics = eventBus.getMetrics();
      expect(metrics.errorCount).toBe(2);
    });
  });
});