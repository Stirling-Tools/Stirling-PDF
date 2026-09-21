import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const {
  createClient,
  stopAutoRefresh,
  onAuthStateChange,
  unsubscribe,
  getSession,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  stopAutoRefresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
import {
  clearSupabaseSession,
  configureSupabase,
  getSupabaseClient,
} from "@app/auth/supabase/supabaseClient";

const config = { url: "https://project.supabase.co", key: "public-key" };
const key = "sb-project-auth-token";

describe("local SaaS session disposal", () => {
  beforeEach(() => {
    stopAutoRefresh.mockResolvedValue(undefined);
    clearSupabaseSession();
    localStorage.clear();
    vi.clearAllMocks();
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
    createClient.mockImplementation(() => ({
      auth: { stopAutoRefresh, onAuthStateChange, getSession },
    }));
  });

  it("publishes renewed SDK sessions and detaches retired client listeners", async () => {
    const restored = vi.fn();
    window.addEventListener("stirling-saas-session-restored", restored);
    try {
      configureSupabase(config);
      const notify = onAuthStateChange.mock.calls[0][0];
      notify("INITIAL_SESSION", { access_token: "current" });
      notify("SIGNED_IN", null);
      expect(restored).not.toHaveBeenCalled();
      getSession.mockResolvedValueOnce({
        data: { session: { access_token: "current" } },
        error: null,
      });
      getSession.mockResolvedValueOnce({
        data: { session: { access_token: "renewed" } },
        error: null,
      });
      notify("SIGNED_IN", { access_token: "current" });
      notify("TOKEN_REFRESHED", { access_token: "renewed" });
      await vi.waitFor(() => expect(restored).toHaveBeenCalledTimes(2));
      clearSupabaseSession();
      notify("TOKEN_REFRESHED", { access_token: "old-owner" });
      expect(restored).toHaveBeenCalledTimes(2);
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("stirling-saas-session-restored", restored);
    }
  });

  it("prevents an in-flight SDK refresh from restoring a cleared session", () => {
    configureSupabase(config);
    const storage = createClient.mock.calls[0][2].auth.storage;
    storage.setItem(key, "previous-session");
    clearSupabaseSession();
    storage.setItem(key, "late-refresh");
    expect(localStorage.getItem(key)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
    expect(getSupabaseClient()).toBeNull();
    expect(stopAutoRefresh).toHaveBeenCalledOnce();
  });

  it("prevents an old client from overwriting or deleting the next user's session", () => {
    configureSupabase(config);
    const previous = createClient.mock.calls[0][2].auth.storage;
    clearSupabaseSession();
    configureSupabase(config);
    const next = createClient.mock.calls[1][2].auth.storage;
    next.setItem(key, "next-user");
    previous.setItem(key, "old-user");
    previous.removeItem(key);
    expect(next.getItem(key)).toBe("next-user");
  });
});

describe("browser session isolation", () => {
  let storageListeners: EventListenerOrEventListenerObject[];
  beforeEach(() => {
    stopAutoRefresh.mockResolvedValue(undefined);
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
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
    createClient.mockImplementation(() => ({
      auth: { stopAutoRefresh, onAuthStateChange, getSession },
    }));
  });
  afterEach(() => {
    storageListeners.forEach((listener) =>
      window.removeEventListener("storage", listener),
    );
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prevents another tab's pending refresh from restoring a logged-out session", async () => {
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

  it("reads the in-memory fallback when persistent storage rejects writes", async () => {
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
    expect(secondTab.getSupabaseClient()).toBeNull();
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
