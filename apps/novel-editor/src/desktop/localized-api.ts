type AnyMethod = (...args: unknown[]) => unknown;

/**
 * Wrap every API method so errors from Rust and the project store reach the UI in the selected language.
 *
 * The wrapper must return a plain object, not a `Proxy`: the renderer bootstrap freezes the API, and a
 * frozen property forces a `Proxy` `get` trap to return the target's exact value. A trap that lazily
 * builds a wrapper violates that invariant and throws a `TypeError` on the first property access, which
 * leaves the whole window blank.
 */
export function localizeApiErrors<T extends object>(api: T, message: (error: unknown) => string): T {
  const wrapped: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(api as Record<string, unknown>)) {
    if (typeof value !== "function" || property.startsWith("on")) {
      wrapped[property] = value;
      continue;
    }
    const method = value as AnyMethod;
    wrapped[property] = (...args: unknown[]): unknown => {
      try {
        const result = method.apply(api, args);
        return result instanceof Promise
          ? result.catch((error: unknown) => { throw new Error(message(error)); })
          : result;
      } catch (error) {
        throw new Error(message(error));
      }
    };
  }
  return wrapped as T;
}
