import { EventEmitter } from 'events';
import { QueryEvent } from '../types';

type EventListener = (event: QueryEvent) => void | Promise<void>;

interface ListenerConfig {
  listener: EventListener;
  options?: ListenerOptions;
  once?: boolean;
}

interface ListenerOptions {
  filter?: (event: QueryEvent) => boolean;
  replay?: boolean;
  priority?: number;
}

export interface EventMetrics {
  totalEvents: number;
  eventCounts: Record<string, number>;
  listenerCounts: Record<string, number>;
  errorCount: number;
}

export class EventBus extends EventEmitter {
  static readonly DEFAULT_MAX_LISTENERS = 100;


  private eventListeners: Map<string, Set<ListenerConfig>>;
  private wildcardListeners: Set<ListenerConfig>;
  private replayBuffer?: QueryEvent[];
  private replayBufferSize?: number;
  private metrics: EventMetrics;

  constructor() {
    super();
    this.setMaxListeners(EventBus.DEFAULT_MAX_LISTENERS);
    this.eventListeners = new Map();
    this.wildcardListeners = new Set();
    this.metrics = {
      totalEvents: 0,
      eventCounts: {},
      listenerCounts: {},
      errorCount: 0
    };
  }

  /**
   * Emit a QueryEvent to all registered listeners
   */
  emitEvent(event: QueryEvent): void {
    this.metrics.totalEvents++;
    this.metrics.eventCounts[event.type] = (this.metrics.eventCounts[event.type] || 0) + 1;

    // Store in replay buffer if enabled
    if (this.replayBuffer && this.replayBufferSize) {
      this.replayBuffer.push(event);
      // Keep buffer within size limit
      if (this.replayBuffer.length > this.replayBufferSize) {
        this.replayBuffer = this.replayBuffer.slice(-this.replayBufferSize);
      }
    }

    // Emit to type-specific listeners
    const typeListeners = this.eventListeners.get(event.type);
    if (typeListeners) {
      for (const config of typeListeners) {
        this.invokeListener(config, event, event.type);
      }
    }

    // Emit to wildcard listeners
    for (const config of this.wildcardListeners) {
      this.invokeListener(config, event, '*');
    }
  }

  /**
   * Emit a QueryEvent asynchronously, waiting for all async listeners
   */
  async emitEventAsync(event: QueryEvent): Promise<void> {
    this.metrics.totalEvents++;
    this.metrics.eventCounts[event.type] = (this.metrics.eventCounts[event.type] || 0) + 1;

    // Store in replay buffer if enabled
    if (this.replayBuffer && this.replayBufferSize) {
      this.replayBuffer.push(event);
      if (this.replayBuffer.length > this.replayBufferSize) {
        this.replayBuffer = this.replayBuffer.slice(-this.replayBufferSize);
      }
    }

    const promises: Promise<void>[] = [];

    // Emit to type-specific listeners
    const typeListeners = this.eventListeners.get(event.type);
    if (typeListeners) {
      for (const config of typeListeners) {
        promises.push(this.invokeListenerAsync(config, event, event.type));
      }
    }

    // Emit to wildcard listeners
    for (const config of this.wildcardListeners) {
      promises.push(this.invokeListenerAsync(config, event, '*'));
    }

    await Promise.all(promises);
  }

  /**
   * Register a listener for a specific event type
   */
  on(eventType: string, listener: EventListener | ((...args: any[]) => void), options?: ListenerOptions): this {
    // For 'error' events, use native EventEmitter behavior
    if (eventType === 'error') {
      super.on(eventType, listener as (...args: any[]) => void);
      return this;
    }

    const config: ListenerConfig = { listener: listener as EventListener, options };

    if (eventType === '*') {
      this.wildcardListeners.add(config);
    } else {
      if (!this.eventListeners.has(eventType)) {
        this.eventListeners.set(eventType, new Set());
      }
      this.eventListeners.get(eventType)!.add(config);
    }

    // Update metrics
    this.updateListenerCounts();

    // Replay events if requested
    if (options?.replay && this.replayBuffer) {
      for (const event of this.replayBuffer) {
        if (eventType === '*' || event.type === eventType) {
          this.invokeListener(config, event, eventType);
        }
      }
    }

    return this;
  }

  /**
   * Register a one-time listener for a specific event type
   */
  once(eventType: string, listener: EventListener | ((...args: any[]) => void)): this {
    // For 'error' events, use native EventEmitter behavior
    if (eventType === 'error') {
      super.once(eventType, listener as (...args: any[]) => void);
      return this;
    }

    const config: ListenerConfig = { listener: listener as EventListener, once: true };

    if (eventType === '*') {
      this.wildcardListeners.add(config);
    } else {
      if (!this.eventListeners.has(eventType)) {
        this.eventListeners.set(eventType, new Set());
      }
      this.eventListeners.get(eventType)!.add(config);
    }

    // Update metrics
    this.updateListenerCounts();

    return this;
  }

  /**
   * Remove a specific listener
   */
  off(eventType: string, listener: EventListener | ((...args: any[]) => void)): this {
    // For 'error' events, use native EventEmitter behavior
    if (eventType === 'error') {
      super.off(eventType, listener as (...args: any[]) => void);
      return this;
    }

    if (eventType === '*') {
      for (const config of this.wildcardListeners) {
        if (config.listener === listener) {
          this.wildcardListeners.delete(config);
        }
      }
    } else {
      const typeListeners = this.eventListeners.get(eventType);
      if (typeListeners) {
        for (const config of typeListeners) {
          if (config.listener === listener) {
            typeListeners.delete(config);
          }
        }
      }
    }

    // Update metrics
    this.updateListenerCounts();

    return this;
  }

  /**
   * Remove all listeners for a specific event type
   */
  removeAllListeners(eventType?: string): this {
    if (eventType === undefined) {
      this.eventListeners.clear();
      this.wildcardListeners.clear();
    } else if (eventType === '*') {
      this.wildcardListeners.clear();
    } else {
      this.eventListeners.delete(eventType);
    }

    // Update metrics
    this.updateListenerCounts();

    return this;
  }

  /**
   * Get the count of listeners for a specific event type
   */
  listenerCount(eventType: string): number {
    if (eventType === '*') {
      return this.wildcardListeners.size;
    }
    return this.eventListeners.get(eventType)?.size || 0;
  }

  /**
   * Enable replay buffer with specified size
   */
  enableReplay(bufferSize: number): void {
    this.replayBufferSize = bufferSize;
    this.replayBuffer = [];
  }

  /**
   * Get recent events from the replay buffer
   */
  getRecentEvents(): QueryEvent[] {
    return this.replayBuffer ? [...this.replayBuffer] : [];
  }

  /**
   * Get event metrics
   */
  getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  /**
   * Invoke a listener with error handling
   */
  private invokeListener(config: ListenerConfig, event: QueryEvent, eventType: string): void {
    // Apply filter if specified
    if (config.options?.filter && !config.options.filter(event)) {
      return;
    }

    try {
      config.listener(event);
    } catch (error) {
      this.metrics.errorCount++;
      // Emit error event with context using EventEmitter's native emit
      // to avoid recursion in our own emitEvent method
      super.emit('error', {
        message: 'Event listener error',
        cause: error,
        eventType: eventType === '*' ? event.type : eventType,
        event
      });
    }

    // Remove if it was a once listener
    if (config.once) {
      if (eventType === '*') {
        this.wildcardListeners.delete(config);
      } else {
        const typeListeners = this.eventListeners.get(eventType);
        if (typeListeners) {
          typeListeners.delete(config);
        }
      }
      this.updateListenerCounts();
    }
  }

  /**
   * Invoke a listener asynchronously with error handling
   */
  private async invokeListenerAsync(config: ListenerConfig, event: QueryEvent, eventType: string): Promise<void> {
    // Apply filter if specified
    if (config.options?.filter && !config.options.filter(event)) {
      return;
    }

    try {
      await config.listener(event);
    } catch (error) {
      this.metrics.errorCount++;
      // Emit error event with context using EventEmitter's native emit
      // to avoid recursion in our own emitEvent method
      super.emit('error', {
        message: 'Event listener error',
        cause: error,
        eventType: eventType === '*' ? event.type : eventType,
        event
      });
    }

    // Remove if it was a once listener
    if (config.once) {
      if (eventType === '*') {
        this.wildcardListeners.delete(config);
      } else {
        const typeListeners = this.eventListeners.get(eventType);
        if (typeListeners) {
          typeListeners.delete(config);
        }
      }
      this.updateListenerCounts();
    }
  }

  /**
   * Update listener count metrics
   */
  private updateListenerCounts(): void {
    this.metrics.listenerCounts = {};

    // Count type-specific listeners
    for (const [type, listeners] of this.eventListeners) {
      this.metrics.listenerCounts[type] = listeners.size;
    }

    // Count wildcard listeners
    if (this.wildcardListeners.size > 0) {
      this.metrics.listenerCounts['*'] = this.wildcardListeners.size;
    }
  }
}