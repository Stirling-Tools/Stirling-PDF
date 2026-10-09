import { expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_URL: "https://auth.stirling.example",
  SUPABASE_KEY: "publishable-key",
}));

it("licenses and checks out against the Stirling Cloud the app signs in to", async () => {
  const { isSupabaseConfigured, supabase } =
    await import("@app/services/supabaseClient");

  expect(isSupabaseConfigured).toBe(true);
  expect(supabase).not.toBeNull();
  expect(createClient).toHaveBeenCalledWith(
    "https://auth.stirling.example",
    "publishable-key",
    expect.anything(),
  );
});
