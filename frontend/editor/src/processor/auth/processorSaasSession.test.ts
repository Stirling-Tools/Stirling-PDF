import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factories can reference it before the import runs.
const { state } = vi.hoisted(() => ({
  state: { client: null as { auth: { getSession: () => unknown } } | null },
}));

vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => state.client,
}));
vi.mock("@processor/auth/saasSupabase", () => ({
  ensureSaasSupabase: vi.fn(),
}));

import { getProcessorSaasToken } from "@processor/auth/processorSaasSession";

describe("getProcessorSaasToken — self-hosted (account-link login)", () => {
  beforeEach(() => {
    state.client = null;
  });

  it("returns null when the SaaS client isn't configured (not signed in)", async () => {
    expect(await getProcessorSaasToken()).toBeNull();
  });

  it("returns the access token from the current session", async () => {
    state.client = {
      auth: {
        getSession: async () => ({
          data: { session: { access_token: "tok-123" } },
        }),
      },
    };
    expect(await getProcessorSaasToken()).toBe("tok-123");
  });

  it("returns null when there is a client but no active session", async () => {
    state.client = {
      auth: { getSession: async () => ({ data: { session: null } }) },
    };
    expect(await getProcessorSaasToken()).toBeNull();
  });
});
