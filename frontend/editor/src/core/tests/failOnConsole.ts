import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

type ConsoleMethod = "error" | "warn";

const WATCHED: ConsoleMethod[] = ["error", "warn"];

type Capture = { method: ConsoleMethod; args: unknown[] };

/**
 * Vitest setup that fails any test whose code calls console.error or
 * console.warn. The goal is to keep the browser console clean during normal
 * usage of the app — React key warnings, act() warnings, deprecation
 * notices, and runtime errors should all surface as test failures rather
 * than silently scrolling past in CI.
 *
 * If a test legitimately needs to assert that a warning fires, capture it
 * with `vi.spyOn(console, "warn").mockImplementation(...)` inside the test
 * itself — the per-test spy installed below restores in afterEach, so a
 * test-local spy takes precedence while it is active.
 */
export function installFailOnConsole(): void {
  const captured: Capture[] = [];
  const spies: MockInstance[] = [];

  beforeEach(() => {
    captured.length = 0;
    spies.length = 0;
    for (const method of WATCHED) {
      const original = console[method].bind(console);
      const spy = vi
        .spyOn(console, method)
        .mockImplementation((...args: unknown[]) => {
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
    if (captured.length === 0) return;
    const lines = captured
      .map((c) => `  console.${c.method}: ${formatArgs(c.args)}`)
      .join("\n");
    captured.length = 0;
    throw new Error(
      `Test produced unexpected console output:\n${lines}\n\n` +
        "Fix the underlying warning/error, or capture it explicitly in the " +
        "test with vi.spyOn(console, ...).mockImplementation(...).",
    );
  });
}

function formatArgs(args: unknown[]): string {
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
