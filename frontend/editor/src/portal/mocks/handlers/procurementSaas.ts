import { http, HttpResponse } from "msw";

/**
 * MSW mock for the real SaaS procurement endpoints (`apiClient.saas` → VITE_SAAS_API_URL, which is
 * `http://saas.mock` in dev/Storybook). Lets the trial → quote → accept flow run without the Java
 * backend (Storybook + mocks-on dev). Pricing mirrors ProcurementPricingService.
 */
const SAAS = "http://saas.mock";

const EMPTY = {
  dealId: null,
  stage: null,
  deployment: "cloud",
  seats: 0,
  trialStartedAt: null,
  trialEndsAt: null,
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  latestQuote: null,
};

interface Cfg {
  volume: number;
  users?: number;
  intensity: number;
  sizeMult: number;
  deployment: string;
  serviceLevel: string;
  termYears: number;
  indemnification: boolean;
  training: boolean;
  qbr: boolean;
  businessName?: string;
  contactName?: string;
  contactEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  poNumber?: string;
  taxId?: string;
}

let deal: typeof EMPTY | (Record<string, unknown> & { latestQuote: unknown }) =
  EMPTY;
let seq = 0;

const TERM = [0, 0.03, 0.05, 0.06, 0.07]; // meter-only, 1..5 years

// Mirror of ProcurementPricingService (D71): run-based curve, flat priced needs, USD.
function priceQuote(cfg: Cfg) {
  const LIST = 0.01;
  const FLOOR = 0.005;
  const intensity = Math.max(1, cfg.intensity || 4);
  const runVol = Math.max(0, cfg.volume) * intensity;
  const volDisc =
    runVol > 1_000_000
      ? Math.min(0.5, 0.06 * Math.log2(runVol / 1_000_000))
      : 0;
  // File-size tier (D93) scales the rate after the floor; snap to a known multiplier.
  const sizeMult = [1.0, 1.4, 2.4].includes(cfg.sizeMult) ? cfg.sizeMult : 1.0;
  const rate = Math.max(FLOOR, LIST * (1 - volDisc)) * sizeMult;
  const termDisc = TERM[Math.min(Math.max(cfg.termYears, 1), 5) - 1];
  const annualBase = Math.round(runVol * rate) * 100; // whole $ → minor
  const meterNet = Math.round(runVol * rate * (1 - termDisc)) * 100;
  const termDiscount = meterNet - annualBase; // <= 0
  const support = cfg.serviceLevel === "dedicated" ? 3_000_000 : 0;
  const deploy =
    cfg.deployment === "airgap"
      ? 3_600_000
      : cfg.deployment === "selfhost"
        ? 1_200_000
        : 0;
  const indemnity = cfg.indemnification ? Math.round(meterNet * 0.05) : 0;
  const qbr = cfg.qbr ? 800_000 : 0;
  const training = cfg.training ? 750_000 : 0;
  const annualNetMinor = meterNet + support + deploy + indemnity + qbr;
  const tcvMinor = annualNetMinor * cfg.termYears + training;

  const posture =
    intensity === 2
      ? "Essentials"
      : intensity === 7
        ? "Regulated"
        : intensity === 4
          ? "Governed"
          : `${intensity}-policy`;
  const deployName =
    cfg.deployment === "airgap"
      ? "Air-gapped"
      : cfg.deployment === "selfhost"
        ? "Self-hosted"
        : "Stirling Cloud";

  type Kind = "RECURRING" | "ONE_TIME" | "DISCOUNT" | "INCLUDED";
  const lines: {
    key: string;
    label: string;
    kind: Kind;
    amountMinor: number;
  }[] = [
    {
      key: "usage",
      label: `PDF processing — ${cfg.volume.toLocaleString()} PDFs/yr at $${(rate * intensity).toFixed(4)}/PDF (${posture} posture)`,
      kind: "RECURRING",
      amountMinor: annualBase,
    },
    {
      key: "seats",
      label: "Unlimited users + SSO / SCIM / RBAC / audit",
      kind: "INCLUDED",
      amountMinor: 0,
    },
  ];
  if (termDiscount < 0)
    lines.push({
      key: "multi-year",
      label: `${cfg.termYears}-year commitment`,
      kind: "DISCOUNT",
      amountMinor: termDiscount,
    });
  if (support > 0)
    lines.push({
      key: "support",
      label: "Dedicated SE / CSM",
      kind: "RECURRING",
      amountMinor: support,
    });
  if (deploy > 0)
    lines.push({
      key: "deployment",
      label: `${deployName} deployment`,
      kind: "RECURRING",
      amountMinor: deploy,
    });
  if (indemnity > 0)
    lines.push({
      key: "indemnification",
      label: "IP indemnification",
      kind: "RECURRING",
      amountMinor: indemnity,
    });
  if (qbr > 0)
    lines.push({
      key: "qbr",
      label: "Quarterly business reviews",
      kind: "RECURRING",
      amountMinor: qbr,
    });
  if (training > 0)
    lines.push({
      key: "training",
      label: "Onboarding & training",
      kind: "ONE_TIME",
      amountMinor: training,
    });

  seq += 1;
  return {
    quoteId: seq,
    quoteNumber: `QT-DEMO-${String(seq).padStart(4, "0")}`,
    status: "draft",
    currency: "USD",
    annualNetMinor,
    tcvMinor,
    renewalAnnualNetMinor: Math.round(annualNetMinor * 1.03), // +3% CPI on renewal
    cpiRatePct: 3,
    lineItems: lines,
    validUntil: "2026-07-31",
    stripeQuoteId: null,
    invoiceUrl: null,
    invoicePdf: null,
    config: {
      volume: cfg.volume,
      users: 0,
      intensity,
      sizeMult,
      deployment: cfg.deployment || "cloud",
      termYears: cfg.termYears,
      serviceLevel: cfg.serviceLevel,
      indemnification: cfg.indemnification,
      training: cfg.training,
      qbr: cfg.qbr,
      businessName: cfg.businessName ?? "",
      contactName: cfg.contactName ?? "",
      contactEmail: cfg.contactEmail ?? "",
      addressLine1: cfg.addressLine1 ?? "",
      addressLine2: cfg.addressLine2 ?? "",
      city: cfg.city ?? "",
      region: cfg.region ?? "",
      postalCode: cfg.postalCode ?? "",
      poNumber: cfg.poNumber ?? "",
      taxId: cfg.taxId ?? "",
    },
  };
}

export function resetProcurementSaasStore() {
  deal = EMPTY;
  seq = 0;
}

export const procurementSaasHandlers = [
  http.get(`${SAAS}/api/v1/procurement`, () => HttpResponse.json(deal)),
  http.post(`${SAAS}/api/v1/procurement/trial/start`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Partial<{
      deployment: string;
      users: number;
    }>;
    const allowed = ["cloud", "selfhost", "airgap"];
    const now = Date.now();
    deal = {
      dealId: 1,
      stage: "trial",
      deployment: allowed.includes(body.deployment ?? "")
        ? body.deployment
        : "cloud",
      seats: Math.max(0, Number(body.users) || 0),
      trialStartedAt: new Date(now).toISOString(),
      trialEndsAt: new Date(now + 14 * 86_400_000).toISOString(),
      trialExtensionsUsed: 0,
      licensed: true,
      licenseKey: "MOCK-TRIAL-KEY-0001",
      latestQuote: null,
    };
    return HttpResponse.json(deal);
  }),
  http.post(`${SAAS}/api/v1/procurement/quote`, async ({ request }) => {
    const cfg = (await request.json()) as Cfg;
    const quote = priceQuote(cfg);
    const d = (
      deal.dealId ? deal : { dealId: 1, trialExtensionsUsed: 0 }
    ) as Record<string, unknown>;
    deal = {
      ...d,
      stage: "quote",
      licensed: true,
      latestQuote: quote,
    } as never;
    return HttpResponse.json(quote);
  }),
  http.post(`${SAAS}/api/v1/procurement/trial/extend`, () => {
    const d = deal as Record<string, unknown>;
    if (d.dealId) {
      const base = d.trialEndsAt
        ? Date.parse(d.trialEndsAt as string)
        : Date.now();
      d.trialEndsAt = new Date(base + 7 * 86_400_000).toISOString();
      d.trialExtensionsUsed = ((d.trialExtensionsUsed as number) ?? 0) + 1;
    }
    return HttpResponse.json(deal);
  }),
  http.post(`${SAAS}/api/v1/procurement/agreement`, () => {
    (deal as Record<string, unknown>).stage = "security";
    return HttpResponse.json(deal);
  }),
  http.post(`${SAAS}/api/v1/procurement/go-live`, () => {
    const d = deal as Record<string, unknown>;
    if (d.dealId) {
      d.stage = "active";
      d.licensed = true;
      d.licenseKey = "MOCK-ENTERPRISE-KEY-0001";
    }
    return HttpResponse.json(deal);
  }),
  http.get(`${SAAS}/api/v1/procurement/license/file`, () => {
    const q = (deal as { latestQuote: { config?: Cfg } | null }).latestQuote;
    // Offline .lic is available only for an air-gapped deployment (matches the Java backend).
    if (q?.config?.deployment !== "airgap") {
      return new HttpResponse(null, { status: 404 });
    }
    return new HttpResponse(
      "-----BEGIN LICENSE FILE-----\nmock-offline-license\n-----END LICENSE FILE-----\n",
      { headers: { "Content-Type": "text/plain" } },
    );
  }),
  http.post(`${SAAS}/api/v1/procurement/reset`, () => {
    resetProcurementSaasStore();
    return HttpResponse.json(EMPTY);
  }),

  // Stripe Quote edge functions (supabase.functions.invoke → ${url}/functions/v1/{name}).
  http.post(`${SAAS}/functions/v1/issue-procurement-quote`, () => {
    const q = (deal as { latestQuote: Record<string, unknown> | null })
      .latestQuote;
    if (q) {
      q.status = "sent";
      q.stripeQuoteId = `qt_mock_${q.quoteId}`;
    }
    return HttpResponse.json(q);
  }),
  http.post(`${SAAS}/functions/v1/accept-procurement-quote`, () => {
    const q = (deal as { latestQuote: Record<string, unknown> | null })
      .latestQuote;
    const invoiceUrl = "https://invoice.stripe.com/i/mock_procurement";
    const invoicePdf = "https://invoice.stripe.com/i/mock_procurement/pdf";
    if (q) {
      q.status = "accepted";
      q.invoiceUrl = invoiceUrl;
      q.invoicePdf = invoicePdf;
      (deal as Record<string, unknown>).stage = "procurement";
    }
    return HttpResponse.json({
      status: "accepted",
      subscriptionId: "sub_mock_procurement",
      invoiceUrl,
      invoicePdf,
    });
  }),
  http.post(`${SAAS}/functions/v1/get-procurement-quote-pdf`, () => {
    // A minimal valid PDF so the download opens something in Storybook / mock dev.
    const pdf = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
    return new HttpResponse(pdf, {
      headers: { "Content-Type": "application/pdf" },
    });
  }),
];
