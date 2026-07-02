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
  trialStartedAt: null,
  trialEndsAt: null,
  trialExtensionsUsed: 0,
  licensed: false,
  latestQuote: null,
};

interface Cfg {
  volume: number;
  serviceLevel: string;
  termYears: number;
  indemnification: boolean;
  training: boolean;
  qbr: boolean;
  currency: string;
}

let deal: typeof EMPTY | (Record<string, unknown> & { latestQuote: unknown }) =
  EMPTY;
let seq = 0;

const SLA: Record<string, number> = {
  standard: 0,
  priority: 0.15,
  dedicated: 0.3,
};
const TERM = [0, 0.05, 0.1, 0.12, 0.15];

function priceQuote(cfg: Cfg) {
  const perPdf = cfg.volume >= 5_000_000 ? 3 : cfg.volume >= 1_000_000 ? 4 : 5;
  const usage = Math.round(cfg.volume * perPdf);
  const withSla = Math.round(usage * (1 + (SLA[cfg.serviceLevel] ?? 0)));
  const withInd = cfg.indemnification ? Math.round(withSla * 1.05) : withSla;
  const disc = Math.round(
    withInd * TERM[Math.min(Math.max(cfg.termYears, 1), 5) - 1],
  );
  const qbr = cfg.qbr ? 800_000 : 0;
  const training = cfg.training ? 750_000 : 0;
  const annualNetMinor = withInd - disc + qbr;
  const tcvMinor = annualNetMinor * cfg.termYears + training;

  type Kind = "RECURRING" | "ONE_TIME" | "DISCOUNT" | "INCLUDED";
  const lines: {
    key: string;
    label: string;
    kind: Kind;
    amountMinor: number;
  }[] = [
    {
      key: "usage",
      label: "PDF processing",
      kind: "RECURRING",
      amountMinor: usage,
    },
    {
      key: "seats",
      label: "Unlimited users + SSO / SCIM / RBAC",
      kind: "INCLUDED",
      amountMinor: 0,
    },
  ];
  if (withSla !== usage)
    lines.push({
      key: "service-level",
      label:
        cfg.serviceLevel === "dedicated"
          ? "Dedicated service level"
          : "Priority service level",
      kind: "RECURRING",
      amountMinor: withSla - usage,
    });
  if (withInd !== withSla)
    lines.push({
      key: "indemnification",
      label: "IP indemnification",
      kind: "RECURRING",
      amountMinor: withInd - withSla,
    });
  if (qbr > 0)
    lines.push({
      key: "qbr",
      label: "Quarterly business reviews",
      kind: "RECURRING",
      amountMinor: qbr,
    });
  if (disc > 0)
    lines.push({
      key: "multi-year",
      label: `${cfg.termYears}-year commitment`,
      kind: "DISCOUNT",
      amountMinor: -disc,
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
    status: "sent",
    currency: cfg.currency || "USD",
    annualNetMinor,
    tcvMinor,
    lineItems: lines,
    validUntil: "2026-07-31",
    checkoutFunction: "create-procurement-checkout",
    config: {
      volume: cfg.volume,
      users: 0,
      deployment: "cloud",
      termYears: cfg.termYears,
      serviceLevel: cfg.serviceLevel,
      indemnification: cfg.indemnification,
      training: cfg.training,
      qbr: cfg.qbr,
      currency: cfg.currency || "USD",
    },
  };
}

export function resetProcurementSaasStore() {
  deal = EMPTY;
  seq = 0;
}

export const procurementSaasHandlers = [
  http.get(`${SAAS}/api/v1/procurement`, () => HttpResponse.json(deal)),
  http.get(`${SAAS}/api/v1/procurement/estimate`, ({ request }) => {
    const users = Number(new URL(request.url).searchParams.get("users") ?? 0);
    return HttpResponse.json({
      annualVolume: Math.round(users * 5 * 230 * 1.75),
    });
  }),
  http.post(`${SAAS}/api/v1/procurement/trial/start`, () => {
    const now = Date.now();
    deal = {
      dealId: 1,
      stage: "trial",
      trialStartedAt: new Date(now).toISOString(),
      trialEndsAt: new Date(now + 14 * 86_400_000).toISOString(),
      trialExtensionsUsed: 0,
      licensed: true,
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
  http.post(`${SAAS}/api/v1/procurement/reset`, () => {
    resetProcurementSaasStore();
    return HttpResponse.json(EMPTY);
  }),
  http.post(`${SAAS}/api/v1/procurement/quote/:id/accept`, () => {
    const q = (deal as { latestQuote: { status?: string } | null }).latestQuote;
    if (q) {
      q.status = "accepted";
      (deal as Record<string, unknown>).stage = "procurement";
    }
    return HttpResponse.json(q);
  }),
];
