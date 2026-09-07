import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Branch coverage for the Stripe edge-function client: the embedded-checkout vs
 * already-subscribed-redirect vs neither-secret-nor-url mapping, the mock flag,
 * unconfigured Supabase, and the portal-session path.
 */
const { getClient, invoke, rpc } = vi.hoisted(() => ({
  getClient: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => getClient(),
  configureSupabase: vi.fn(),
}));

import {
  acceptBundleStripeQuote,
  cancelBundleQuote,
  createBundleStripeQuote,
  createCheckoutSession,
  createPortalSession,
  fetchBundleQuotePdf,
  finalizeBundleInvoice,
  getLatestBundleQuote,
  StripeFunctionError,
  upsertBundleQuote,
} from "@portal/billing/stripe";

const req = { teamId: 1, successUrl: "s", cancelUrl: "c" } as const;

beforeEach(() => {
  invoke.mockReset();
  rpc.mockReset();
  getClient.mockReset().mockReturnValue({ functions: { invoke }, rpc });
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

describe("createBundleStripeQuote", () => {
  it("sends team_id + quote_id (+ po_number) and maps the Stripe quote handles", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        stripe_quote_id: "qt_1",
        stripe_quote_number: "QT-0007",
      },
      error: null,
    });
    const q = await createBundleStripeQuote({
      teamId: 1,
      quoteId: 7,
      poNumber: "PO-9",
    });
    expect(q).toEqual({ stripeQuoteId: "qt_1", stripeQuoteNumber: "QT-0007" });
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("create-payg-bundle-quote");
    expect(opts.body).toMatchObject({
      team_id: 1,
      quote_id: 7,
      po_number: "PO-9",
    });
  });

  it("throws when the edge fn reports failure", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "bundle_pricing_not_configured" },
      error: null,
    });
    await expect(
      createBundleStripeQuote({ teamId: 1, quoteId: 7 }),
    ).rejects.toThrow(/bundle_pricing_not_configured/);
  });
});

describe("acceptBundleStripeQuote", () => {
  it("maps the invoice response and sends quote_id", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        invoice_id: "in_1",
        hosted_invoice_url: "https://pay/in_1",
        invoice_pdf: "https://pdf/in_1",
        status: "open",
      },
      error: null,
    });
    const inv = await acceptBundleStripeQuote({ teamId: 1, quoteId: 7 });
    expect(inv).toEqual({
      invoiceId: "in_1",
      hostedInvoiceUrl: "https://pay/in_1",
      invoicePdf: "https://pdf/in_1",
      status: "open",
    });
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("accept-payg-bundle-quote");
    expect(opts.body).toMatchObject({ team_id: 1, quote_id: 7 });
  });

  it("throws when the edge fn reports failure", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "quote_not_issued" },
      error: null,
    });
    await expect(
      acceptBundleStripeQuote({ teamId: 1, quoteId: 7 }),
    ).rejects.toThrow(/quote_not_issued/);
  });
});

describe("cancelBundleQuote", () => {
  it("sends team_id + quote_id and resolves on success", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await cancelBundleQuote({ teamId: 1, quoteId: 7 });
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("cancel-payg-bundle-quote");
    expect(opts.body).toMatchObject({ team_id: 1, quote_id: 7 });
  });

  it("throws when the edge fn reports failure (e.g. already paid)", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "invoice_already_paid" },
      error: null,
    });
    await expect(cancelBundleQuote({ teamId: 1, quoteId: 7 })).rejects.toThrow(
      /invoice_already_paid/,
    );
  });
});

describe("fetchBundleQuotePdf", () => {
  it("returns the PDF blob from the GET route", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    invoke.mockResolvedValue({ data: blob, error: null });
    const out = await fetchBundleQuotePdf(7);
    expect(out).toBe(blob);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("create-payg-bundle-quote?quote_id=7");
    expect(opts.method).toBe("GET");
  });

  it("throws when the response is not a file", async () => {
    invoke.mockResolvedValue({ data: { success: false }, error: null });
    await expect(fetchBundleQuotePdf(7)).rejects.toBeInstanceOf(
      StripeFunctionError,
    );
  });
});

describe("upsertBundleQuote", () => {
  const quoteInput = {
    teamId: 1,
    users: 25,
    posturePolicies: 4,
    sizeMult: 1.2,
    pipelineMult: 1,
    provisionedMonthlyVolume: 10000,
    poolCredits: 576000,
    priceMinor: 480000,
    currency: "usd",
    consented: true,
    eulaVersion: "2026-07-draft",
  } as const;

  it("maps the RPC row and sends p_* args (create — no p_quote_id)", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          quote_id: 7,
          status: "issued",
          valid_until: "2026-08-16T00:00:00Z",
        },
      ],
      error: null,
    });
    const q = await upsertBundleQuote(quoteInput);
    expect(q).toEqual({
      quoteId: 7,
      status: "issued",
      validUntil: "2026-08-16T00:00:00Z",
    });
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("payg_upsert_bundle_quote");
    expect(args).toMatchObject({
      p_team_id: 1,
      p_posture_policies: 4,
      p_size_mult: 1.2,
      p_pipeline_mult: 1,
      p_pool_credits: 576000,
      p_users: 25,
      p_price_minor: 480000,
      p_currency: "usd",
      p_consented: true,
      p_eula_version: "2026-07-draft",
    });
    expect(args).not.toHaveProperty("p_quote_id");
  });

  it("passes p_quote_id when editing an existing quote", async () => {
    rpc.mockResolvedValue({
      data: [{ quote_id: 7, status: "issued", valid_until: "x" }],
      error: null,
    });
    await upsertBundleQuote({ ...quoteInput, quoteId: 7 });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_quote_id: 7 });
  });

  it("throws a StripeFunctionError (with code) on an RPC error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "not a leader", code: "42501" },
    });
    const err = await upsertBundleQuote(quoteInput).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeFunctionError);
    expect((err as StripeFunctionError).code).toBe("42501");
  });
});

describe("finalizeBundleInvoice", () => {
  it("maps the invoice response and sends quote_id (+ optional po_number)", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        invoice_id: "in_1",
        hosted_invoice_url: "https://pay/in_1",
        invoice_pdf: "https://pdf/in_1",
        status: "open",
      },
      error: null,
    });
    const inv = await finalizeBundleInvoice({
      teamId: 1,
      quoteId: 7,
      poNumber: "PO-9",
    });
    expect(inv).toEqual({
      invoiceId: "in_1",
      hostedInvoiceUrl: "https://pay/in_1",
      invoicePdf: "https://pdf/in_1",
      status: "open",
    });
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("finalize-payg-bundle-invoice");
    expect(opts.body).toMatchObject({
      team_id: 1,
      quote_id: 7,
      po_number: "PO-9",
    });
  });

  it("throws when the edge fn reports failure", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "quote_not_accepted" },
      error: null,
    });
    await expect(
      finalizeBundleInvoice({ teamId: 1, quoteId: 7 }),
    ).rejects.toThrow(/quote_not_accepted/);
  });
});

describe("getLatestBundleQuote", () => {
  it("maps the latest open quote row (numeric size_mult coerced)", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          quote_id: 7,
          users: 25,
          posture_policies: 4,
          size_mult: "1.2",
          pipeline_mult: 1,
          pool_credits: 576000,
          price_minor: 480000,
          currency: "usd",
          consented_at: "2026-07-17T00:00:00Z",
          stripe_quote_id: "qt_1",
          stripe_quote_number: "QT-0007",
          stripe_ref: "in_1",
          valid_until: "2026-08-16T00:00:00Z",
        },
      ],
      error: null,
    });
    const q = await getLatestBundleQuote(1);
    expect(q).toEqual({
      quoteId: 7,
      users: 25,
      posturePolicies: 4,
      sizeMult: 1.2,
      pipelineMult: 1,
      poolCredits: 576000,
      priceMinor: 480000,
      currency: "usd",
      consentedAt: "2026-07-17T00:00:00Z",
      stripeQuoteId: "qt_1",
      stripeQuoteNumber: "QT-0007",
      stripeRef: "in_1",
      validUntil: "2026-08-16T00:00:00Z",
    });
    expect(rpc.mock.calls[0][0]).toBe("payg_get_latest_bundle_quote");
    expect(rpc.mock.calls[0][1]).toEqual({ p_team_id: 1 });
  });

  it("returns null when the team has no open quote", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getLatestBundleQuote(1)).toBeNull();
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
