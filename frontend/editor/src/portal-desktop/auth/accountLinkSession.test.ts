import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  identity: "selfhosted|https://a.example|alice",
  clearSupabaseSession: vi.fn(),
}));
vi.mock("@app/services/connectionIdentity", () => ({
  connectionIdentityKey: () => h.identity,
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  clearSupabaseSession: h.clearSupabaseSession,
}));
vi.mock("@app/portal/queryClient", () => ({
  getPortalQueryClient: () => ({ clear: vi.fn() }),
}));

import { bindAccountLinkSession } from "@app/portal/auth/accountLinkSession";

beforeEach(() => {
  localStorage.clear();
  h.identity = "selfhosted|https://a.example|alice";
  h.clearSupabaseSession.mockClear();
});

it("drops the Stirling session when the same local user id belongs to another server", () => {
  bindAccountLinkSession(1);
  h.clearSupabaseSession.mockClear();

  bindAccountLinkSession(1);
  expect(h.clearSupabaseSession).not.toHaveBeenCalled();

  h.identity = "selfhosted|https://b.example|alice";
  bindAccountLinkSession(1);
  expect(h.clearSupabaseSession).toHaveBeenCalledOnce();
});
