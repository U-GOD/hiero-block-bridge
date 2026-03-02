import { describe, it, expect } from 'vitest';
import { ok, err, type Result, type Ok, type Err } from '../../../src/types/result.js';

describe('ok()', () => {
  it('creates a result with ok: true', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
  });

  it('stores the value', () => {
    const result = ok('hello');
    expect(result.value).toBe('hello');
  });

  it('works with complex objects', () => {
    const data = { name: 'test', items: [1, 2, 3] };
    const result = ok(data);
    expect(result.value).toEqual(data);
  });

  it('works with null', () => {
    const result = ok(null);
    expect(result.ok).toBe(true);
    expect(result.value).toBeNull();
  });
});

describe('err()', () => {
  it('creates a result with ok: false', () => {
    const result = err('something failed');
    expect(result.ok).toBe(false);
  });

  it('stores the error', () => {
    const result = err(new Error('oops'));
    expect(result.error.message).toBe('oops');
  });

  it('works with string errors', () => {
    const result = err('bad input');
    expect(result.error).toBe('bad input');
  });
});

describe('Result type narrowing', () => {
  it('narrows to Ok when ok is true', () => {
    const result: Result<number, string> = ok(42);
    if (result.ok) {
      const value: number = result.value;
      expect(value).toBe(42);
    } else {
      expect.unreachable('Should be Ok');
    }
  });

  it('narrows to Err when ok is false', () => {
    const result: Result<number, string> = err('failed');
    if (!result.ok) {
      const error: string = result.error;
      expect(error).toBe('failed');
    } else {
      expect.unreachable('Should be Err');
    }
  });

  it('Ok and Err are mutually exclusive', () => {
    const success: Result<string, Error> = ok('data');
    const failure: Result<string, Error> = err(new Error('oops'));

    expect(success.ok).not.toBe(failure.ok);
  });
});
