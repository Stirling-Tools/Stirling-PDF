import { beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
}));
vi.mock("@app/auth/supabase", () => ({
  supabase: sdk,
  getCurrentUser: vi.fn(),
  isUserAnonymous: vi.fn(),
  signInAnonymously: vi.fn(),
}));
import {
  configureSupabase,
  getSupabaseClient,
  clearSupabaseSession,
} from "@app/auth/supabase/supabaseClient";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sdk.auth.signOut.mockClear();
});
it("uses the hosted login client without any account-link storage or replacement client", () => {
  localStorage.setItem("stirling.saasSessionGeneration", "old-selfhost-marker");
  expect(
    configureSupabase({
      url: "https://example.test",
      key: "public-key",
      authOptions: { detectSessionInUrl: false },
    }),
  ).toBe(sdk);
  expect(getSupabaseClient()).toBe(sdk);
  expect(localStorage.getItem("stirling.portalSaasOwner")).toBeNull();
  expect(localStorage.getItem("stirling.saasSessionGeneration")).toBe(
    "old-selfhost-marker",
  );
});
it("clears the hosted session through normal SDK local sign-out", () => {
  clearSupabaseSession();
  expect(sdk.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(localStorage.getItem("stirling.saasSessionGeneration")).toBeNull();
});
