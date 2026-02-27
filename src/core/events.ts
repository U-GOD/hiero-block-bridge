import { EventEmitter } from 'events';

/**
 * A type-safe event emitter.
 *
 * Wraps Node.js EventEmitter with generic type constraints so that
 * event names and listener signatures are checked at compile time.
 *
 * @typeParam T - An interface mapping event names to listener signatures.
 *
 * @example
 * ```typescript
 * interface MyEvents {
 *   data: (payload: string) => void;
 *   error: (err: Error) => void;
 * }
 *
 * const emitter = new TypedEventEmitter<MyEvents>();
 * emitter.on('data', (payload) => console.log(payload)); // payload: string
 * emitter.emit('data', 'hello');
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TypedEventEmitter<T extends Record<string, (...args: any[]) => void>> {
  private readonly emitter = new EventEmitter();

  /** Register a listener for the given event. */
  on<K extends keyof T & string>(event: K, listener: T[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /** Register a one-time listener for the given event. */
  once<K extends keyof T & string>(event: K, listener: T[K]): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /** Remove a listener for the given event. */
  off<K extends keyof T & string>(event: K, listener: T[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /** Emit an event with the given arguments. */
  emit<K extends keyof T & string>(event: K, ...args: Parameters<T[K]>): boolean {
    return this.emitter.emit(event, ...args);
  }

  /** Remove all listeners, optionally for a specific event. */
  removeAllListeners<K extends keyof T & string>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  /** Get the number of listeners for a given event. */
  listenerCount<K extends keyof T & string>(event: K): number {
    return this.emitter.listenerCount(event);
  }
}
