import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  navigatorLock,
  NavigatorLockAcquireTimeoutError,
} from "@supabase/supabase-js";
import { resilientNavigatorLock } from "@app/auth/resilientNavigatorLock";

// Mock only the stock navigatorLock so we can drive its success/timeout
// behaviour; the real one is exercised by Supabase itself. Everything else
// (including the real NavigatorLockAcquireTimeoutError) is kept via
// importOriginal so createClient etc. still work for other saas modules.
vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...actual, navigatorLock: vi.fn() };
});

const mockNavigatorLock = vi.mocked(navigatorLock);

function withWebLocks() {
  // Presence is all that matters — resilientNavigatorLock only checks that the
  // Web Locks API exists before delegating to navigatorLock.
  vi.stubGlobal("navigator", { locks: { request: vi.fn() } });
}

beforeEach(() => {
  mockNavigatorLock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resilientNavigatorLock", () => {
  it("runs the callback unguarded when the Web Locks API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(resilientNavigatorLock("lock:x", 10000, fn)).resolves.toBe(
      "ok",
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockNavigatorLock).not.toHaveBeenCalled();
  });

  it("delegates to navigatorLock and returns its result", async () => {
    withWebLocks();
    mockNavigatorLock.mockResolvedValue(42);
    const fn = vi.fn().mockResolvedValue(42);
    await expect(resilientNavigatorLock("lock:x", 10000, fn)).resolves.toBe(42);
    expect(mockNavigatorLock).toHaveBeenCalledWith("lock:x", 10000, fn);
  });

  it("falls back to an unguarded run instead of throwing on acquisition timeout", async () => {
    withWebLocks();
    mockNavigatorLock.mockRejectedValue(
      new NavigatorLockAcquireTimeoutError("timed out waiting 10000ms"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi.fn().mockResolvedValue("recovered");
    await expect(resilientNavigatorLock("lock:x", 10000, fn)).resolves.toBe(
      "recovered",
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it("falls back on any error flagged isAcquireTimeout", async () => {
    withWebLocks();
    const timeout = Object.assign(new Error("stolen"), {
      isAcquireTimeout: true,
    });
    mockNavigatorLock.mockRejectedValue(timeout);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi.fn().mockResolvedValue("recovered");
    await expect(resilientNavigatorLock("lock:x", 5000, fn)).resolves.toBe(
      "recovered",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propagates non-timeout errors", async () => {
    withWebLocks();
    const boom = new Error("network down");
    mockNavigatorLock.mockRejectedValue(boom);
    const fn = vi.fn().mockResolvedValue("unused");
    await expect(resilientNavigatorLock("lock:x", 10000, fn)).rejects.toBe(
      boom,
    );
    expect(fn).not.toHaveBeenCalled();
  });
});
