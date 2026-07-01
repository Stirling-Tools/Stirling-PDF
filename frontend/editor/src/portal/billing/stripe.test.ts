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
vi.mock("@shared/auth/supabase/supabaseClient", () => ({
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
