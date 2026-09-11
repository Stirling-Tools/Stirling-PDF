import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
const config = { url: "https://project.supabase.co", key: "public" };
const key = "sb-project-auth-token";

describe("browser session isolation", () => {
  let storageListeners: EventListenerOrEventListenerObject[];
  beforeEach(() => {
    storageListeners = [];
    const addEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type, listener, options) => {
        if (type === "storage") storageListeners.push(listener);
        addEventListener(type, listener, options);
      },
    );
    vi.stubGlobal("crypto", webcrypto);
    localStorage.clear();
    vi.clearAllMocks();
    createClient.mockImplementation(() => ({
      auth: { stopAutoRefresh: vi.fn().mockResolvedValue(undefined) },
    }));
  });
  afterEach(() => {
    storageListeners.forEach((listener) =>
      window.removeEventListener("storage", listener),
    );
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("[US09] prevents another tab's pending refresh from restoring a logged-out session", async () => {
    // Each tab has its own module state but shares the origin's localStorage.
    vi.resetModules();
    const firstTab = await import("@app/auth/supabase/supabaseClient");
    firstTab.configureSupabase(config);
    vi.resetModules();
    const secondTab = await import("@app/auth/supabase/supabaseClient");
    secondTab.configureSupabase(config);
    const secondStorage = createClient.mock.calls[1][2].auth.storage;
    secondStorage.setItem(key, "old-owner");
    firstTab.clearSupabaseSession();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        oldValue: "old-owner",
        newValue: null,
      }),
    );
    secondStorage.setItem(key, "late-old-owner-refresh");
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("[US15] reads the in-memory fallback when persistent storage rejects writes", async () => {
    vi.resetModules();
    const client = await import("@app/auth/supabase/supabaseClient");
    client.configureSupabase(config);
    const storage = createClient.mock.calls[0][2].auth.storage;
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    storage.setItem(key, "renewed-session");
    expect(storage.getItem(key)).toBe("renewed-session");
  });

  it("rejects a late cross-tab write even before its storage event is delivered", async () => {
    vi.resetModules();
    const firstTab = await import("@app/auth/supabase/supabaseClient");
    firstTab.configureSupabase(config);
    vi.resetModules();
    const secondTab = await import("@app/auth/supabase/supabaseClient");
    secondTab.configureSupabase(config);
    const previous = createClient.mock.calls[1][2].auth.storage;
    previous.setItem(key, "old-session");
    const delayedWrite = localStorage.getItem(key)!;
    firstTab.clearSupabaseSession();
    firstTab.configureSupabase(config);
    const current = createClient.mock.calls[2][2].auth.storage;
    localStorage.setItem(key, delayedWrite);
    expect(current.getItem(key)).toBeNull();
    previous.setItem(key, "late-session");
    expect(current.getItem(key)).toBeNull();
  });

  it("does not recover stale disk credentials after deletion fails", async () => {
    vi.resetModules();
    const client = await import("@app/auth/supabase/supabaseClient");
    client.configureSupabase(config);
    createClient.mock.calls[0][2].auth.storage.setItem(key, "old-session");
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() => client.clearSupabaseSession()).not.toThrow();
    client.configureSupabase(config);
    expect(createClient.mock.calls[1][2].auth.storage.getItem(key)).toBeNull();
  });

  it("clears the other tab's client when it receives the invalidation event", async () => {
    vi.resetModules();
    const client = await import("@app/auth/supabase/supabaseClient");
    client.configureSupabase(config);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "stirling.saasSessionGeneration",
        newValue: "changed",
      }),
    );
    expect(client.getSupabaseClient()).toBeNull();
  });
});
