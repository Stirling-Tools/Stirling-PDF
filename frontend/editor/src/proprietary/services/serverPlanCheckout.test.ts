import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What this pins is the lane the request lands on. `self_hosted` is what selects the Keygen
 * licence lane, and a client-supplied email is what lets it bill the wrong customer, so both
 * absences are the contract — not incidental.
 */
const { invoke, getSession } = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@app/services/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke }, auth: { getSession } },
}));

import { createServerPlanCheckoutSession } from "@app/services/serverPlanCheckout";

const plan = {
  lookupKey: "selfhosted:server:yearly",
  serverQuantity: 2,
  installationId: "inst-1",
  uiMode: "embedded",
} as const;

beforeEach(() => {
  invoke.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: { user: {} } } });
});

describe("createServerPlanCheckoutSession", () => {
  it("buys as the signed-in account: no self_hosted lane, no client-supplied email", async () => {
    invoke.mockResolvedValue({
      data: { clientSecret: "cs_1", sessionId: "cs_sess" },
      error: null,
    });

    const session = await createServerPlanCheckoutSession(plan);

    expect(session).toEqual({
      clientSecret: "cs_1",
      url: null,
      sessionId: "cs_sess",
    });
    const [fn, options] = invoke.mock.calls[0];
    expect(fn).toBe("create-checkout");
    expect(options.body).not.toHaveProperty("self_hosted");
    expect(options.body).not.toHaveProperty("email");
    expect(options.body).toMatchObject({
      lookup_key: "selfhosted:server:yearly",
      server_quantity: 2,
      installation_id: "inst-1",
      ui_mode: "embedded",
      requires_seats: false,
      seat_count: 1,
    });
  });

  it("passes the hosted-mode return URLs through", async () => {
    invoke.mockResolvedValue({
      data: { url: "https://checkout.stripe.com/x", sessionId: "s" },
      error: null,
    });

    const session = await createServerPlanCheckoutSession({
      ...plan,
      uiMode: "hosted",
      successUrl: "https://host/ok",
      cancelUrl: "https://host/no",
    });

    expect(session.url).toBe("https://checkout.stripe.com/x");
    expect(session.clientSecret).toBeNull();
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      success_url: "https://host/ok",
      cancel_url: "https://host/no",
    });
  });

  it("refuses before invoking when no Stirling account is signed in", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(createServerPlanCheckoutSession(plan)).rejects.toThrow(
      /Sign in to the Stirling account/,
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("throws the edge function's own error", async () => {
    invoke.mockResolvedValue({ data: { error: "Unauthorized" }, error: null });

    await expect(createServerPlanCheckoutSession(plan)).rejects.toThrow(
      /Unauthorized/,
    );
  });

  it("throws when the session carries neither a secret nor a URL", async () => {
    invoke.mockResolvedValue({ data: { sessionId: "s" }, error: null });

    await expect(createServerPlanCheckoutSession(plan)).rejects.toThrow(
      /neither/,
    );
  });
});
