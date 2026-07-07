import { afterEach, describe, expect, it, vi } from "vitest";

// Mock only the low-level client factory — NOT ensureSaasSupabase itself — so this
// exercises the real SaaS configurator and proves it wires the shared client from
// the editor's env (the gap finding #1 flagged: the old path left it unconfigured).
const configureSupabase = vi.fn();
const getSupabaseClient = vi.fn(() => ({ __client: true }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  configureSupabase,
  getSupabaseClient,
}));

describe("ensureSaasSupabase (SaaS) — configures the shared client from the editor env", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    configureSupabase.mockClear();
    getSupabaseClient.mockClear();
  });

  it("configures from VITE_SUPABASE_* (same project as the editor) and returns the client", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY", "anon-key");
    // Dynamic import so the module reads the stubbed env at load. Resolves to the
    // SaaS override via the @portal cascade in the saas project.
    const { ensureSaasSupabase, isSaasSupabaseConfigured } =
      await import("@portal/auth/saasSupabase");
    expect(isSaasSupabaseConfigured).toBe(true);
    const client = ensureSaasSupabase();
    expect(configureSupabase).toHaveBeenCalledWith({
      url: "https://proj.supabase.co",
      key: "anon-key",
    });
    expect(client).not.toBeNull();
  });

  it("stays unconfigured (client null) when the editor env is absent", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY", "");
    const { ensureSaasSupabase, isSaasSupabaseConfigured } =
      await import("@portal/auth/saasSupabase");
    expect(isSaasSupabaseConfigured).toBe(false);
    expect(ensureSaasSupabase()).toBeNull();
    expect(configureSupabase).not.toHaveBeenCalled();
  });
});
