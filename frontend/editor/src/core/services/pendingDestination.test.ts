import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingDestination,
  rememberPendingDestination,
  resetPendingDestinationForTests,
  takePendingDestination,
} from "@app/services/pendingDestination";

const KEY = "stirling-pending-destination";

beforeEach(() => {
  window.localStorage.clear();
  resetPendingDestinationForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pendingDestination", () => {
  it("returns the remembered path", () => {
    rememberPendingDestination("/processor/procurement");
    expect(takePendingDestination()).toBe("/processor/procurement");
  });

  it("keeps the query string, which carries the destination's own intent", () => {
    rememberPendingDestination("/processor/pipelines?setup=redaction");
    expect(takePendingDestination()).toBe(
      "/processor/pipelines?setup=redaction",
    );
  });

  it("returns null when nothing was remembered", () => {
    expect(takePendingDestination()).toBeNull();
  });

  it("survives a new page load", () => {
    rememberPendingDestination("/processor/procurement");
    resetPendingDestinationForTests();
    expect(takePendingDestination()).toBe("/processor/procurement");
  });

  it("consumes the intent, so it redirects one sign-in only", () => {
    rememberPendingDestination("/processor/procurement");
    expect(takePendingDestination()).toBe("/processor/procurement");
    resetPendingDestinationForTests();
    expect(takePendingDestination()).toBeNull();
  });

  it("gives the same answer twice within a page load", () => {
    rememberPendingDestination("/processor/procurement");
    expect(takePendingDestination()).toBe("/processor/procurement");
    expect(takePendingDestination()).toBe("/processor/procurement");
  });

  it("refuses to store an unsafe path", () => {
    rememberPendingDestination("//evil.example.com");
    rememberPendingDestination("https://evil.example.com");
    rememberPendingDestination("/\\evil.example.com");
    expect(takePendingDestination()).toBeNull();
  });

  it("refuses to return an unsafe path written directly to storage", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ path: "//evil.example.com", at: Date.now() }),
    );
    expect(takePendingDestination()).toBeNull();
  });

  it("refuses to store an auth route, which would loop", () => {
    rememberPendingDestination("/login");
    expect(takePendingDestination()).toBeNull();
    resetPendingDestinationForTests();
    rememberPendingDestination("/auth/callback");
    expect(takePendingDestination()).toBeNull();
  });

  it("expires an intent older than the window", () => {
    vi.useFakeTimers();
    rememberPendingDestination("/processor/procurement");
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    resetPendingDestinationForTests();
    expect(takePendingDestination()).toBeNull();
  });

  it("keeps an intent inside the window", () => {
    vi.useFakeTimers();
    rememberPendingDestination("/processor/procurement");
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    resetPendingDestinationForTests();
    expect(takePendingDestination()).toBe("/processor/procurement");
  });

  it("survives a corrupt entry", () => {
    window.localStorage.setItem(KEY, "not json");
    expect(takePendingDestination()).toBeNull();
  });

  it("clears without reading", () => {
    rememberPendingDestination("/processor/procurement");
    clearPendingDestination();
    expect(takePendingDestination()).toBeNull();
  });

  it("re-remembering replaces a taken intent in the same page load", () => {
    rememberPendingDestination("/processor/procurement");
    expect(takePendingDestination()).toBe("/processor/procurement");
    rememberPendingDestination("/processor/users");
    expect(takePendingDestination()).toBe("/processor/users");
  });
});
