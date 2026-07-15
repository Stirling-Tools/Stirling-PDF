import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Branch coverage for the Stripe edge-function client: the embedded-checkout vs
 * already-subscribed-redirect vs neither-secret-nor-url mapping, the mock flag,
 * unconfigured Supabase, and the portal-session path.
 */
const { getClient, invoke } = vi.hoisted(() => ({
  getClient: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => getClient(),
  configureSupabase: vi.fn(),
}));

import {
  createBundleCheckoutSession,
  createCheckoutSession,
  createPortalSession,
  StripeFunctionError,
} from "@portal/billing/stripe";

const req = { teamId: 1, successUrl: "s", cancelUrl: "c" } as const;
const bundleReq = {
  teamId: 1,
  units: 60000,
  consented: true,
  eulaVersion: "2026-07-draft",
  successUrl: "s",
  cancelUrl: "c",
} as const;

beforeEach(() => {
  invoke.mockReset();
  getClient.mockReset().mockReturnValue({ functions: { invoke } });
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

  it("throws unconfigured when there is no Supabase client", async () => {
    getClient.mockReturnValue(null);
    const err = await createCheckoutSession(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeFunctionError);
    expect((err as StripeFunctionError).code).toBe("unconfigured");
  });
});

describe("createBundleCheckoutSession", () => {
  it("sends units + consent (never a quote id) and maps client_secret", async () => {
    invoke.mockResolvedValue({
      data: { client_secret: "cs_bundle" },
      error: null,
    });
    const s = await createBundleCheckoutSession(bundleReq);
    expect(s.clientSecret).toBe("cs_bundle");
    expect(s.alreadySubscribed).toBe(false);

    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("create-payg-bundle-checkout");
    expect(opts.body).toMatchObject({
      team_id: 1,
      units: 60000,
      consented: true,
      eula_version: "2026-07-draft",
      redirect_on_completion: "never",
    });
    // The quote round-trip is gone — the body must not carry a ticket id.
    expect(opts.body).not.toHaveProperty("quote_id");
  });

  it("flags a mock client secret", async () => {
    invoke.mockResolvedValue({
      data: { client_secret: "cs_mock_bundle" },
      error: null,
    });
    expect((await createBundleCheckoutSession(bundleReq)).mock).toBe(true);
  });

  it("throws the edge fn error when neither client_secret nor url is returned", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "bundle_pricing_not_configured" },
      error: null,
    });
    await expect(createBundleCheckoutSession(bundleReq)).rejects.toThrow(
      /bundle_pricing_not_configured/,
    );
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
