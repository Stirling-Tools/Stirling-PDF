import { afterEach, describe, expect, it, vi } from "vitest";

// Mock only the low-level client factory — NOT ensureSaasSupabase itself — so this
// exercises the real configurator and proves it wires the shared client from the
// one Stirling Supabase env (VITE_SUPABASE_*), shared by every flavor.
const configureSupabase = vi.fn();
const getSupabaseClient = vi.fn(() => ({ __client: true }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  configureSupabase,
  getSupabaseClient,
}));

describe("ensureSaasSupabase — configures the shared client from VITE_SUPABASE_*", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    configureSupabase.mockClear();
    getSupabaseClient.mockClear();
  });

  it("configures from VITE_SUPABASE_* and returns the client", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY", "anon-key");
    // Dynamic import so the module reads the stubbed env at load.
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

  it("stays unconfigured (client null) when the Supabase env is absent", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY", "");
    const { ensureSaasSupabase, isSaasSupabaseConfigured } =
      await import("@portal/auth/saasSupabase");
    expect(isSaasSupabaseConfigured).toBe(false);
    expect(ensureSaasSupabase()).toBeNull();
    expect(configureSupabase).not.toHaveBeenCalled();
  });
});
