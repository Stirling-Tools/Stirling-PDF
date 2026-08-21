import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

type ConsoleMethod = "error" | "warn";
type Matcher = string | RegExp;

const WATCHED: ConsoleMethod[] = ["error", "warn"];

type Capture = { method: ConsoleMethod; args: unknown[] };

type Expectation = {
  method: ConsoleMethod;
  matcher: Matcher;
  /**
   * `true` for `expectConsole` (a contract: the test fails if no matching
   * call fires); `false` for `allowConsole` (incidental noise: absorbed if
   * it happens, ignored if it doesn't).
   */
  required: boolean;
  matched: boolean;
};

const captured: Capture[] = [];
const expectations: Expectation[] = [];

/**
 * Vitest setup that fails any test whose code calls console.error or
 * console.warn. The goal is to keep the browser console clean during normal
 * usage of the app: React key warnings, act() warnings, deprecation
 * notices, and runtime errors should all surface as test failures rather
 * than silently scrolling past in CI.
 *
 * If a test legitimately needs to drive a log:
 *   - Use `expectConsole.error(/pattern/)` when the log is part of the
 *     contract under test. The matching call is absorbed AND the test
 *     fails if it never fires, so the log can't silently disappear later.
 *   - Use `allowConsole.warn(/pattern/)` when the log is incidental
 *     (third-party noise, an artefact of a fake JWT, etc.). The matching
 *     call is absorbed; nothing is asserted.
 *
 * Anything that doesn't match an expectation/allowance still fails the
 * test as before.
 */
export function installFailOnConsole(): void {
  const spies: MockInstance[] = [];

  beforeEach(() => {
    captured.length = 0;
    expectations.length = 0;
    spies.length = 0;
    for (const method of WATCHED) {
      const original = console[method].bind(console);
      const spy = vi
        .spyOn(console, method)
        .mockImplementation((...args: unknown[]) => {
          const text = formatArgs(args);
          const match = expectations.find(
            (e) => e.method === method && matches(e.matcher, text),
          );
          if (match) {
            match.matched = true;
            return;
          }
          captured.push({ method, args });
          original(...args);
        });
      spies.push(spy);
    }
  });

  afterEach(() => {
    for (const spy of spies.splice(0)) {
      spy.mockRestore();
    }

    const unmet = expectations.filter((e) => e.required && !e.matched);
    const localCaptured = captured.splice(0);
    expectations.length = 0;

    if (unmet.length > 0) {
      const lines = unmet
        .map((e) => `  console.${e.method}: ${formatMatcher(e.matcher)}`)
        .join("\n");
      throw new Error(
        `Expected console output never fired:\n${lines}\n\n` +
          "If production stopped logging this, either restore the log or " +
          "update/remove the expectConsole call.",
      );
    }
    if (localCaptured.length === 0) return;
    const lines = localCaptured
      .map((c) => `  console.${c.method}: ${formatArgs(c.args)}`)
      .join("\n");
    throw new Error(
      `Test produced unexpected console output:\n${lines}\n\n` +
        "If the log is expected, capture it with expectConsole.error/warn " +
        "(contract) or allowConsole.error/warn (incidental) from " +
        "@app/tests/failOnConsole.",
    );
  });
}

/**
 * Register a required console expectation. The test passes only if at
 * least one matching call fires; matching calls are absorbed instead of
 * failing the test.
 */
export const expectConsole = {
  error: (matcher: Matcher) => register("error", matcher, true),
  warn: (matcher: Matcher) => register("warn", matcher, true),
};

/**
 * Register an optional console allowance. Matching calls are absorbed;
 * the test does NOT fail if no matching call fires. Use for incidental
 * noise (fake-JWT decode warnings, third-party library logs in dev, etc.).
 */
export const allowConsole = {
  error: (matcher: Matcher) => register("error", matcher, false),
  warn: (matcher: Matcher) => register("warn", matcher, false),
};

function register(method: ConsoleMethod, matcher: Matcher, required: boolean) {
  expectations.push({ method, matcher, required, matched: false });
}

/** Exported for the failOnConsole unit tests; not part of the public API. */
export function matches(matcher: Matcher, text: string): boolean {
  return typeof matcher === "string"
    ? text.includes(matcher)
    : matcher.test(text);
}

function formatMatcher(matcher: Matcher): string {
  return matcher instanceof RegExp
    ? matcher.toString()
    : JSON.stringify(matcher);
}

/** Exported for the failOnConsole unit tests; not part of the public API. */
export function formatArgs(args: unknown[]): string {
  return args.map(formatArg).join(" ");
}

function formatArg(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
