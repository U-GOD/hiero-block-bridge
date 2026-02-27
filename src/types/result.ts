/**
 * Result monad for operations that can fail.
 * Provides a type-safe alternative to try/catch for expected failures.
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err('Division by zero');
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log(result.value); // 5
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */

/** Successful result containing a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed result containing an error. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Discriminated union: either a success or failure. */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Create a successful result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create a failed result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
