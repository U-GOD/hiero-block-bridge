import { describe, it, expect, vi } from 'vitest';
import { TypedEventEmitter } from '../../../src/core/events.js';

interface TestEvents {
  data: (payload: string) => void;
  count: (n: number) => void;
  empty: () => void;
  multi: (a: string, b: number) => void;
}

describe('TypedEventEmitter', () => {
  it('.on() registers a listener and fires it on emit', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('data', listener);
    emitter.emit('data', 'hello');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('hello');
  });

  it('.emit() passes correct arguments to listeners', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('multi', listener);
    emitter.emit('multi', 'test', 42);

    expect(listener).toHaveBeenCalledWith('test', 42);
  });

  it('.emit() with no-arg event fires correctly', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('empty', listener);
    emitter.emit('empty');

    expect(listener).toHaveBeenCalledOnce();
  });

  it('.off() unregisters a listener', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('data', listener);
    emitter.off('data', listener);
    emitter.emit('data', 'should not fire');

    expect(listener).not.toHaveBeenCalled();
  });

  it('.once() fires only once', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.once('count', listener);
    emitter.emit('count', 1);
    emitter.emit('count', 2);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(1);
  });

  it('multiple listeners on the same event all fire', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('data', listener1);
    emitter.on('data', listener2);
    emitter.emit('data', 'broadcast');

    expect(listener1).toHaveBeenCalledWith('broadcast');
    expect(listener2).toHaveBeenCalledWith('broadcast');
  });

  it('.removeAllListeners() for a specific event', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const dataListener = vi.fn();
    const countListener = vi.fn();

    emitter.on('data', dataListener);
    emitter.on('count', countListener);
    emitter.removeAllListeners('data');

    emitter.emit('data', 'removed');
    emitter.emit('count', 99);

    expect(dataListener).not.toHaveBeenCalled();
    expect(countListener).toHaveBeenCalledWith(99);
  });

  it('.removeAllListeners() with no args removes everything', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('data', listener1);
    emitter.on('count', listener2);
    emitter.removeAllListeners();

    emitter.emit('data', 'gone');
    emitter.emit('count', 0);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('.listenerCount() returns the correct count', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    expect(emitter.listenerCount('data')).toBe(0);

    const fn1 = vi.fn();
    const fn2 = vi.fn();
    emitter.on('data', fn1);
    emitter.on('data', fn2);

    expect(emitter.listenerCount('data')).toBe(2);

    emitter.off('data', fn1);
    expect(emitter.listenerCount('data')).toBe(1);
  });

  it('.on() returns this for chaining', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const result = emitter.on('data', vi.fn());
    expect(result).toBe(emitter);
  });
});
