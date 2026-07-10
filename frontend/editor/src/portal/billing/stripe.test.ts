import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Branch coverage for the Stripe edge-function client: the embedded-checkout vs
 * already-subscribed-redirect vs neither-secret-nor-url mapping, the mock flag,
 * unconfigured Supabase, and the portal-session path.
 */
const { getClient, invoke, getSession } = vi.hoisted(() => ({
  getClient: vi.fn(),
  invoke: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => getClient(),
  configureSupabase: vi.fn(),
}));

import {
  createCheckoutSession,
  createPortalSession,
  StripeFunctionError,
} from "@portal/billing/stripe";

const req = { teamId: 1, successUrl: "s", cancelUrl: "c" } as const;

beforeEach(() => {
  invoke.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
  getClient
    .mockReset()
    .mockReturnValue({ functions: { invoke }, auth: { getSession } });
});
afterEach(() => vi.restoreAllMocks());

describe("createCheckoutSession", () => {
  it("maps embedded checkout (client_secret)", async () => {
    invoke.mockResolvedValue({
      data: { success: true, client_secret: "cs_123" },
      error: null,
    });
    const s = await createCheckoutSession(req);
    expect(s).toEqual({
      clientSecret: "cs_123",
      redirectUrl: null,
      alreadySubscribed: false,
      mock: false,
    });
  });

  it("short-circuits already-subscribed to the portal URL (no client secret)", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        already_subscribed: true,
        portal_url: "https://portal",
      },
      error: null,
    });
    const s = await createCheckoutSession(req);
    expect(s.alreadySubscribed).toBe(true);
    expect(s.redirectUrl).toBe("https://portal");
    expect(s.clientSecret).toBeNull();
  });

  it("flags a mock client secret", async () => {
    invoke.mockResolvedValue({
      data: { success: true, client_secret: "cs_mock_abc" },
      error: null,
    });
    expect((await createCheckoutSession(req)).mock).toBe(true);
  });

  it("throws when success is false", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "no team" },
      error: null,
    });
    await expect(createCheckoutSession(req)).rejects.toBeInstanceOf(
      StripeFunctionError,
    );
  });

  it("throws when neither client_secret nor url is returned", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await expect(createCheckoutSession(req)).rejects.toThrow(/neither/);
  });

  it("prefills billing_owner_email from the signed-in SaaS session", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { email: "leader@acme.com" } } },
    });
    invoke.mockResolvedValue({
      data: { success: true, client_secret: "cs_123" },
      error: null,
    });
    await createCheckoutSession(req);
    expect(invoke).toHaveBeenCalledWith(
      "create-checkout-session",
      expect.objectContaining({
        body: expect.objectContaining({
          billing_owner_email: "leader@acme.com",
        }),
      }),
    );
  });

  it("omits billing_owner_email when no session email is available", async () => {
    invoke.mockResolvedValue({
      data: { success: true, client_secret: "cs_123" },
      error: null,
    });
    await createCheckoutSession(req);
    const body = invoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("billing_owner_email");
  });

  it("an explicit billingOwnerEmail overrides the session", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { email: "session@acme.com" } } },
    });
    invoke.mockResolvedValue({
      data: { success: true, client_secret: "cs_123" },
      error: null,
    });
    await createCheckoutSession({
      ...req,
      billingOwnerEmail: "explicit@acme.com",
    });
    const body = invoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(body.billing_owner_email).toBe("explicit@acme.com");
  });

  it("throws unconfigured when there is no Supabase client", async () => {
    getClient.mockReturnValue(null);
    const err = await createCheckoutSession(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeFunctionError);
    expect((err as StripeFunctionError).code).toBe("unconfigured");
  });
});

describe("createPortalSession", () => {
  it("returns the portal URL", async () => {
    invoke.mockResolvedValue({
      data: { success: true, url: "https://billing" },
      error: null,
    });
    expect(await createPortalSession({ teamId: 1, returnUrl: "r" })).toBe(
      "https://billing",
    );
  });

  it("throws on a free team (no url)", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "team_not_subscribed" },
      error: null,
    });
    await expect(
      createPortalSession({ teamId: 1, returnUrl: "r" }),
    ).rejects.toBeInstanceOf(StripeFunctionError);
  });
});
