import { describe, expect, it } from "vitest";

import type { QuoteConfigInput } from "@portal/api/procurement";
import { previewAnnualMinor } from "@portal/components/procurement/QuoteBuilder";
import { priceQuote } from "@portal/mocks/handlers/procurementSaas";

/**
 * The D71 run-based curve is written three times: the authoritative Java engine
 * (ProcurementPricingService), the client footer estimate (QuoteBuilder.previewAnnualMinor), and
 * the MSW mock (procurementSaas.priceQuote). The client + mock are deliberately non-authoritative,
 * but nothing stopped them silently drifting from the server.
 *
 * This pins both TypeScript copies to each other AND to the exact fixtures locked in the Java
 * ProcurementPricingServiceTest. If the rate card changes on the server, that Java test breaks
 * first; updating these fixtures to match is the reminder to keep the client/mock in step. If the
 * client and mock diverge from one another, this breaks on its own.
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
      expect(previewAnnualMinor(f.cfg)).toBe(f.annualNetMinor);
      expect(priceQuote(f.cfg).annualNetMinor).toBe(f.annualNetMinor);
    });
  }
});
