/**
 * Guard for functions that travel to the browser.
 *
 * Playwright serializes a page function with `Function.prototype.toString()`,
 * and tsx compiles this harness with esbuild's `keepNames`, which rewrites
 * inner function declarations to `__name(fn, "fn")`. That helper lives in the
 * bundler's scope and nowhere else, so a serialized function containing one
 * throws `ReferenceError: __name is not defined` in the page — usually after
 * it has already done part of its work, which is how a broken measurement
 * looks like a real zero.
 *
 * Inline arrows are safe as long as they declare no inner `function`s. When
 * they do, move the body to a source string instead (see `probe.ts`).
 */
export function assertSerializable<T extends (...args: never[]) => unknown>(
  fn: T,
): T {
  const source = fn.toString();
  if (/\b__name\s*\(|\b__spread|\b__defProp|\b__publicField/.test(source)) {
    throw new Error(
      `page function carries bundler helpers and would fail in the browser: ${source.slice(0, 160)}`,
    );
  }
  return fn;
}
