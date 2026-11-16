import { describe, expect, it } from "vitest";

import type { QuoteConfigInput } from "@processor/api/procurement";
import { previewAnnualMinor } from "@processor/components/procurement/quotePricing";
import {
  priceQuote,
  RATE_CARD,
} from "@processor/mocks/handlers/procurementSaas";

/**
 * The pricing formula runs in three places: the authoritative Java engine
 * (ProcurementPricingService), the client's live estimate (quotePricing.previewAnnualMinor) and the
 * MSW mock (procurementSaas.priceQuote). The rates come from the server's rate card, but the
 * formula itself is written in each, so nothing else stops them drifting apart.
 *
 * This pins both TypeScript copies, run over the default rate card, to the exact fixtures locked in
 * the Java ProcurementPricingServiceTest. A formula change on the server breaks that Java test
 * first; updating these fixtures to match is the reminder to change the client and mock too.
 *
 * Keep these numbers identical to ProcurementPricingServiceTest.
 */
function cfg(overrides: Partial<QuoteConfigInput>): QuoteConfigInput {
  return {
    volume: 0,
    users: 0,
    intensity: 4,
    sizeMult: 1.0,
    deployment: "cloud",
    termYears: 3,
    serviceLevel: "standard",
    indemnification: false,
    training: false,
    qbr: false,
    businessName: "",
    ...overrides,
  };
}

// annualNetMinor (USD minor units) — each mirrors an assertion in ProcurementPricingServiceTest.
const FIXTURES: {
  name: string;
  cfg: QuoteConfigInput;
  annualNetMinor: number;
}[] = [
  {
    name: "Northwind — 6M · Governed · cloud · standard · 3yr",
    cfg: cfg({ volume: 6_000_000 }),
    annualNetMinor: 16_527_800,
  },
  {
    name: "Northwind, Standard PDF size (rate ×1.4)",
    cfg: cfg({ volume: 6_000_000, sizeMult: 1.4 }),
    annualNetMinor: 23_138_900,
  },
  {
    name: "acme — 90M · Governed · self-hosted · dedicated · 3yr",
    cfg: cfg({
      volume: 90_000_000,
      deployment: "selfhost",
      serviceLevel: "dedicated",
    }),
    annualNetMinor: 175_200_000,
  },
  {
    name: "1-year term — no meter discount",
    cfg: cfg({ volume: 6_000_000, termYears: 1 }),
    annualNetMinor: 17_397_700,
  },
  {
    name: "2-year term — 3% off the meter",
    cfg: cfg({ volume: 6_000_000, termYears: 2 }),
    annualNetMinor: 16_875_700,
  },
  {
    name: "rate floors at half a cent — 100M · Regulated · 1yr",
    cfg: cfg({ volume: 100_000_000, intensity: 7, termYears: 1 }),
    annualNetMinor: 350_000_000,
  },
];

describe("procurement pricing parity (client ↔ mock ↔ server fixtures)", () => {
  for (const f of FIXTURES) {
    it(`agrees on ${f.name}`, () => {
      expect(previewAnnualMinor(f.cfg, RATE_CARD)).toBe(f.annualNetMinor);
      expect(priceQuote(f.cfg).annualNetMinor).toBe(f.annualNetMinor);
    });
  }
});
