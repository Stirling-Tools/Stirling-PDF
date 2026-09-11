import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
const config = { url: "https://project.supabase.co", key: "public" };
const key = "sb-project-auth-token";

describe("browser session isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    createClient.mockImplementation(() => ({
      auth: { stopAutoRefresh: vi.fn().mockResolvedValue(undefined) },
    }));
  });
  afterEach(() => vi.restoreAllMocks());

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
});
