import type { Wallet } from "@portal/api/billing";

/** Linked, on the one-time free grant — leader view. Override per story. */
export const freeWallet: Wallet = {
  teamId: 42,
  status: "free",
  role: "leader",
  billingPeriodStart: "2026-06-01",
  billingPeriodEnd: "2026-06-30",
  billableUsed: 120,
  billableLimit: 500,
  freeAllowance: 500,
  freeRemaining: 380,
  pricePerDocMinor: 2,
  currency: "usd",
  estimatedBillMinor: null,
  capUsd: null,
  noCap: false,
  stripeSubscriptionId: null,
  spendUnitsThisPeriod: 120,
  categoryBreakdown: { api: 40, ai: 30, automation: 50 },
  members: [],
  recent: [],
};

/** Linked + subscribed (Processor plan), capped, leader view with members. */
export const subscribedWallet: Wallet = {
  teamId: 42,
  status: "subscribed",
  role: "leader",
  billingPeriodStart: "2026-06-01",
  billingPeriodEnd: "2026-06-30",
  billableUsed: 2250,
  billableLimit: 50000,
  freeAllowance: 500,
  freeRemaining: 0,
  pricePerDocMinor: 2,
  currency: "usd",
  estimatedBillMinor: 4500,
  capUsd: 1000,
  noCap: false,
  stripeSubscriptionId: "sub_123",
  spendUnitsThisPeriod: 2250,
  categoryBreakdown: { api: 900, ai: 600, automation: 750 },
  members: [
    {
      userId: "u1",
      name: "Ada Lovelace",
      email: "ada@acme.test",
      spendUnits: 1400,
    },
    {
      userId: "u2",
      name: "Alan Turing",
      email: "alan@acme.test",
      spendUnits: 850,
    },
  ],
  recent: [],
};
