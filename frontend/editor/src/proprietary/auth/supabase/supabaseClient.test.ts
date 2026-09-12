import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, stopAutoRefresh } = vi.hoisted(() => ({
  createClient: vi.fn(),
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
    clearSupabaseSession();
    localStorage.clear();
    vi.clearAllMocks();
    createClient.mockImplementation(() => ({ auth: { stopAutoRefresh } }));
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
