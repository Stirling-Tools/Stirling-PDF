import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, def?: string, vars?: Record<string, unknown>) =>
      def && vars
        ? def.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""))
        : (def ?? _key),
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { BillingScreen } from "@app/billing/BillingScreen";
import { subscribedWallet } from "@app/billing/walletFixtures";

/**
 * Units a linked instance has accrued that the cloud has not billed yet are real spend, and every
 * figure on this screen counts them. Two totals disagreeing by an undisclosed amount is the bug
 * these pin: a customer reconciling against an invoice has no way to explain the gap.
 */
describe("BillingScreen and units pending sync", () => {
  const wallet = {
    ...subscribedWallet,
    spendUnitsThisPeriod: 1000,
    estimatedBillMinor: 1000,
    pricePerDocMinor: 1,
  };

  it("counts them in both the estimate and the credit line, and says so once", () => {
    render(<BillingScreen wallet={wallet} pendingUnits={250} />);

    // 1000 synced + 250 pending, at 1 minor unit each. Twice on purpose: the cycle estimate and
    // the credit line are the two figures that used to disagree.
    expect(screen.getAllByText("$12.50")).toHaveLength(2);
    expect(screen.getByText("1,250 · $0.01 each")).toBeInTheDocument();
    expect(
      screen.getByText(
        "estimated · includes 250 not yet synced from your instances",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about syncing when there is nothing waiting", () => {
    render(<BillingScreen wallet={wallet} pendingUnits={0} />);

    expect(screen.getAllByText("$10.00")).toHaveLength(2);
    expect(screen.getByText("1,000 · $0.01 each")).toBeInTheDocument();
    expect(
      screen.getByText("estimated · the meter settles at close"),
    ).toBeInTheDocument();
  });
});
