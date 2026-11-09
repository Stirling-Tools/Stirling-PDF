import { http, HttpResponse } from "msw";
import { QUOTE_BELOW_MINIMUM, type RateCard } from "@processor/api/procurement";

/**
 * MSW mock for the real SaaS procurement endpoints (`apiClient.saas` → VITE_SAAS_API_URL, which is
 * `http://saas.mock` in dev/Storybook). Lets the trial → quote → accept flow run without the Java
 * backend (Storybook + mocks-on dev). Pricing mirrors ProcurementPricingService.
 */
const SAAS = "http://saas.mock";

/** The server's default cap on trial extensions. */
const MAX_TRIAL_EXTENSIONS = 2;

/** The server's default floor on a quote's annual fee: USD 12,000. */
const MIN_ANNUAL_NET_MINOR = 1_200_000;

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
  agreementSignedVersion: null,
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

/** The deployment the licence follows: the quote's once there is one, else the trial's. */
function entitledDeployment(): string | null {
  const d = deal as {
    dealId: unknown;
    deployment?: string;
    latestQuote: { config?: Cfg } | null;
  };
  if (d.dealId == null) return null;
  return d.latestQuote?.config?.deployment ?? d.deployment ?? null;
}

/** The server's default rate card (PricingRates.defaults()), sent with the deal like the real one. */
export const RATE_CARD: RateCard = {
  listRatePerRun: 0.01,
  floorRatePerRun: 0.005,
  runCurveKnee: 1_000_000,
  discountPerDoubling: 0.06,
  maxVolumeDiscount: 0.5,
  termDiscountByYear: [0, 0.03, 0.05, 0.06, 0.07],
  indemnificationRate: 0.05,
  dedicatedSupportMinor: 3_000_000,
  selfHostDeployMinor: 1_200_000,
  airgapDeployMinor: 3_600_000,
  qbrAnnualMinor: 800_000,
  trainingOneTimeMinor: 750_000,
};

// Mirror of ProcurementPricingService: run-based curve, flat priced needs, USD.
// Exported for the pricing-parity test (see pricingParity.test.ts).
export function priceQuote(cfg: Cfg) {
  const R = RATE_CARD;
  const intensity = Math.max(1, cfg.intensity || 4);
  const runVol = Math.max(0, cfg.volume) * intensity;
  const volDisc =
    runVol > R.runCurveKnee
      ? Math.min(
          R.maxVolumeDiscount,
          R.discountPerDoubling * Math.log2(runVol / R.runCurveKnee),
        )
      : 0;
  // The PDF-size tier scales the rate after the floor; snap to a known multiplier.
  const sizeMult = [1.0, 1.4, 2.4].includes(cfg.sizeMult) ? cfg.sizeMult : 1.0;
  const rate =
    Math.max(R.floorRatePerRun, R.listRatePerRun * (1 - volDisc)) * sizeMult;
  const termDisc =
    R.termDiscountByYear[
      Math.min(Math.max(cfg.termYears, 1), R.termDiscountByYear.length) - 1
    ];
  const annualBase = Math.round(runVol * rate) * 100; // whole $ → minor
  const meterNet = Math.round(runVol * rate * (1 - termDisc)) * 100;
  const termDiscount = meterNet - annualBase; // <= 0
  const support =
    cfg.serviceLevel === "dedicated" ? R.dedicatedSupportMinor : 0;
  const deploy =
    cfg.deployment === "airgap"
      ? R.airgapDeployMinor
      : cfg.deployment === "selfhost"
        ? R.selfHostDeployMinor
        : 0;
  const indemnity = cfg.indemnification
    ? Math.round(meterNet * R.indemnificationRate)
    : 0;
  const qbr = cfg.qbr ? R.qbrAnnualMinor : 0;
  const training = cfg.training ? R.trainingOneTimeMinor : 0;
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
    // A draft has no reference: Stripe assigns the quote number at finalisation, so the mock leaves
    // it null here and fills it when the quote is issued, exactly as the real flow does.
    quoteNumber: null,
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
      users: cfg.users ?? 0,
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

/** The stages a demo can jump straight to. */
export type DemoStage =
  | "trial"
  | "quote"
  | "security"
  | "procurement"
  | "active";

const DEMO_QUOTE: Cfg = {
  volume: 500_000,
  users: 250,
  intensity: 4,
  sizeMult: 1.4,
  // Cloud, not self-hosted: the self-hosted fee alone meets the minimum spend, so a self-hosted
  // deal could never show the builder's minimum guidance.
  deployment: "cloud",
  serviceLevel: "priority",
  termYears: 3,
  indemnification: false,
  training: true,
  qbr: false,
  businessName: "Northwind Logistics",
  contactName: "Dana Lee",
  contactEmail: "dana@northwind.example",
  addressLine1: "500 Howard St",
  city: "San Francisco",
  region: "California",
  postalCode: "94105",
};

/** A trial team far under the minimum spend, so building its quote opens on the minimum check. */
const DEMO_TRIAL_SEATS = 1;

/**
 * Puts the deal straight at a stage with believable data, as if the buyer had walked there, so a
 * demo can skip past steps it doesn't need to show.
 */
export function seedProcurementSaasStage(stage: DemoStage) {
  const day = 86_400_000;
  const now = Date.now();
  const paid = stage === "procurement" || stage === "active";
  const quote =
    stage === "trial"
      ? null
      : {
          ...priceQuote(DEMO_QUOTE),
          status: paid ? "accepted" : "sent",
          stripeQuoteId: "qt_mock_demo",
          quoteNumber: "QT-MOCKPFX-0001-1",
          invoiceUrl: paid
            ? "https://invoice.stripe.com/i/mock_procurement"
            : null,
          invoicePdf: paid
            ? "https://invoice.stripe.com/i/mock_procurement/pdf"
            : null,
        };
  deal = {
    dealId: 1,
    stage,
    deployment: DEMO_QUOTE.deployment,
    seats: stage === "trial" ? DEMO_TRIAL_SEATS : (DEMO_QUOTE.users ?? 0),
    trialStartedAt: new Date(now - 4 * day).toISOString(),
    trialEndsAt: new Date(now + 10 * day).toISOString(),
    trialExtensionsUsed: 0,
    licensed: true,
    licenseKey:
      stage === "active" ? "MOCK-ENTERPRISE-KEY-0001" : "MOCK-TRIAL-KEY-0001",
    agreementSignedVersion: paid ? "SEA v0.9.1" : null,
    businessName: DEMO_QUOTE.businessName,
    contactName: DEMO_QUOTE.contactName,
    contactEmail: DEMO_QUOTE.contactEmail,
    latestQuote: quote,
  };
}

/** The buyer pays their first invoice: the deal goes live, as Stripe's webhook would make it. */
export function markProcurementSaasPaid() {
  const d = deal as Record<string, unknown>;
  if (d.stage !== "procurement") return;
  d.stage = "active";
  d.licenseKey = "MOCK-ENTERPRISE-KEY-0001";
}

/** The deal as the backend returns it from every read and deal-changing call. */
function snapshot() {
  return {
    ...deal,
    minAnnualNetMinor: MIN_ANNUAL_NET_MINOR,
    entitledDeployment: entitledDeployment(),
    rateCard: RATE_CARD,
    maxTrialExtensions: MAX_TRIAL_EXTENSIONS,
  };
}

export const procurementSaasHandlers = [
  http.get(`${SAAS}/api/v1/procurement`, () => HttpResponse.json(snapshot())),
  // Interest: creates the deal at `exploring` when there is none, and never disturbs one that
  // already exists — so the enterprise surface only appears for accounts that asked for it.
  http.post(`${SAAS}/api/v1/procurement/interest`, () => {
    if (deal.dealId == null) {
      deal = { ...deal, dealId: 1, stage: "exploring" };
    }
    return HttpResponse.json(snapshot());
  }),
  http.post(`${SAAS}/api/v1/procurement/trial/start`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Partial<{
      deployment: string;
      users: number;
      businessName: string;
      contactName: string;
      contactEmail: string;
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
      businessName: body.businessName ?? null,
      contactName: body.contactName ?? null,
      contactEmail: body.contactEmail ?? null,
      latestQuote: null,
    };
    return HttpResponse.json(snapshot());
  }),
  http.post(`${SAAS}/api/v1/procurement/quote`, async ({ request }) => {
    const cfg = (await request.json()) as Cfg;
    const quote = priceQuote(cfg);
    if (quote.annualNetMinor < MIN_ANNUAL_NET_MINOR) {
      return HttpResponse.json({ error: QUOTE_BELOW_MINIMUM }, { status: 409 });
    }
    const d = (
      deal.dealId ? deal : { dealId: 1, trialExtensionsUsed: 0 }
    ) as Record<string, unknown>;
    deal = {
      ...d,
      stage: "quote",
      licensed: true,
      latestQuote: quote,
    };
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
    return HttpResponse.json(snapshot());
  }),
  http.post(`${SAAS}/api/v1/procurement/agreement`, () => {
    (deal as Record<string, unknown>).stage = "security";
    return HttpResponse.json(snapshot());
  }),
  http.get(`${SAAS}/api/v1/procurement/agreement/document`, () => {
    const q = (
      deal as {
        latestQuote: {
          quoteNumber?: string;
          annualNetMinor: number;
          config: {
            businessName?: string;
            deployment: string;
            termYears: number;
            users: number;
          };
        } | null;
      }
    ).latestQuote;
    if (!q) return new HttpResponse(null, { status: 404 });
    const usd = (minor: number) =>
      `$${Math.round(minor / 100).toLocaleString("en-US")}`;
    const deployName =
      q.config.deployment === "airgap"
        ? "Air-gapped"
        : q.config.deployment === "selfhost"
          ? "Self-hosted"
          : "Stirling Cloud";
    return HttpResponse.json({
      docId: "enterprise-agreement",
      version: "0.9.1",
      versionLabel: "SEA v0.9.1",
      displayName: "Stirling Enterprise Agreement",
      effectiveDate: "2026-07-10",
      status: "draft",
      markdown: [
        "# Stirling Enterprise Agreement",
        "## Part A — Master Services Agreement",
        "Provider will provide the Stirling PDF Processor and Editor as described in the Order Form.",
        `## Part B — Order Form · ${q.quoteNumber ?? "Q-MOCK"}`,
        // One block: a blank line between rows would end the table.
        [
          "| Term | Value |",
          "| --- | --- |",
          `| Customer | ${q.config.businessName?.trim() || "Customer"} |`,
          `| Subscription | Stirling Enterprise · ${deployName} |`,
          `| Users | ${q.config.users.toLocaleString("en-US")} |`,
          `| Initial term | ${q.config.termYears} year${q.config.termYears === 1 ? "" : "s"} |`,
          `| Annual fee | ${usd(q.annualNetMinor)} |`,
          "| Escalator | +3% at each anniversary during the Term |",
        ].join("\n"),
        "## Part C — Data Processing Addendum",
        "Provider processes Personal Data only on Customer's documented instructions.",
      ].join("\n\n"),
    });
  }),
  http.post(
    `${SAAS}/api/v1/procurement/agreement/sign`,
    async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as Partial<{
        signatoryName: string;
        authorityConfirmed: boolean;
      }>;
      if (!body.signatoryName || !body.authorityConfirmed) {
        return new HttpResponse(null, { status: 400 });
      }
      // Surface the signed agreement for download on the payment/live stage.
      (deal as Record<string, unknown>).agreementSignedVersion = "SEA v0.9.1";
      return HttpResponse.json({
        signatureId: 1,
        versionLabel: "SEA v0.9.1",
        pdfStored: true,
      });
    },
  ),
  http.get(`${SAAS}/api/v1/procurement/agreement/signature/pdf`, () => {
    const signed = (deal as { agreementSignedVersion?: string })
      .agreementSignedVersion;
    if (!signed) return new HttpResponse(null, { status: 404 });
    // A minimal one-page PDF so the browser download works in mock mode.
    const pdf =
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]>>endobj\n" +
      "trailer<</Root 1 0 R>>\n%%EOF";
    return new HttpResponse(pdf, {
      headers: { "Content-Type": "application/pdf" },
    });
  }),
  http.get(`${SAAS}/api/v1/procurement/agreement/document/pdf`, () => {
    // The unsigned agreement PDF is available once a quote exists.
    if (!(deal as { latestQuote: unknown }).latestQuote) {
      return new HttpResponse(null, { status: 404 });
    }
    const pdf =
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]>>endobj\n" +
      "trailer<</Root 1 0 R>>\n%%EOF";
    return new HttpResponse(pdf, {
      headers: { "Content-Type": "application/pdf" },
    });
  }),
  http.post(`${SAAS}/api/v1/procurement/go-live`, () => {
    const d = deal as Record<string, unknown>;
    if (d.dealId) {
      d.stage = "active";
      d.licensed = true;
      d.licenseKey = "MOCK-ENTERPRISE-KEY-0001";
    }
    return HttpResponse.json(snapshot());
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
    return HttpResponse.json(snapshot());
  }),
  http.get(`${SAAS}/api/v1/legal/:docId`, ({ params }) => {
    const docId = String(params.docId);
    const titles: Record<string, string> = {
      eula: "Stirling EULA & Commercial Terms",
      sla: "Stirling SLA Exhibit",
      subprocessors: "Stirling Subprocessors",
    };
    if (!(docId in titles)) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({
      docId,
      version: "1.0.0",
      versionLabel: `${docId.toUpperCase()} v1.0.0`,
      displayName: titles[docId],
      effectiveDate: "2026-07-10",
      status: "draft",
      markdown: `# ${titles[docId]}\n\nThis is a mock of the ${docId} document for local development.\n\n## 1. Terms\n\nThe real text is served from the backend legal registry.`,
    });
  }),
  http.post(`${SAAS}/api/v1/legal/consent`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Partial<{
      documentId: string;
      context: string;
    }>;
    if (!body.documentId || !body.context) {
      return new HttpResponse(null, { status: 400 });
    }
    return new HttpResponse(null, { status: 200 });
  }),

  // Stripe Quote edge functions (supabase.functions.invoke → ${url}/functions/v1/{name}).
  http.post(`${SAAS}/functions/v1/issue-procurement-quote`, () => {
    const q = (deal as { latestQuote: Record<string, unknown> | null })
      .latestQuote;
    if (q) {
      q.status = "sent";
      q.stripeQuoteId = `qt_mock_${q.quoteId}`;
      // Issuing is what mints the reference. Stripe's shape is
      // QT-{customer invoice prefix}-{quote seq}-{revision}.
      q.quoteNumber = `QT-MOCKPFX-${String(q.quoteId).padStart(4, "0")}-1`;
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
