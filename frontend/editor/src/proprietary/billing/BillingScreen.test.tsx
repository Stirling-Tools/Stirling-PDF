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
 * The cycle figures, which are the ones a customer reconciles against an invoice. A linked
 * instance's locally-accrued units are real spend the cloud has not billed yet, so leaving them
 * out under-reports what the period has actually cost.
 */
describe("BillingScreen credits", () => {
  const wallet = {
    ...subscribedWallet,
    spendUnitsThisPeriod: 1000,
    pricePerDocMinor: 1,
  };

  it("counts units the cloud has not billed yet, and says how many", () => {
    render(<BillingScreen wallet={wallet} pendingUnits={250} />);

    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(
      screen.getByText("1,250 · $0.01 each · 250 pending sync"),
    ).toBeInTheDocument();
  });

  it("drops the pending clause when there is nothing waiting", () => {
    render(<BillingScreen wallet={wallet} pendingUnits={0} />);

    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("1,000 · $0.01 each")).toBeInTheDocument();
  });
});
