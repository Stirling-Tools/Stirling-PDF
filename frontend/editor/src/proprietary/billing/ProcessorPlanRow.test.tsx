import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, def?: string, vars?: Record<string, unknown>) =>
      def && vars
        ? def.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""))
        : (def ?? _key),
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { ProcessorPlanRow } from "@app/billing/ProcessorPlanRow";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
import type { Wallet } from "@app/billing/types";

const off = (over: Partial<Wallet> = {}): Wallet => ({
  ...freeWallet,
  processor: { active: false },
  ...over,
});
const on = (over: Partial<Wallet> = {}): Wallet => ({
  ...subscribedWallet,
  processor: { active: true },
  ...over,
});

describe("ProcessorPlanRow", () => {
  it("shows remaining free credits and paid spend separately on focus", () => {
    render(
      <ProcessorPlanRow
        wallet={on({
          freeAllowance: 1000,
          freeRemaining: 600,
          estimatedBillMinor: 2500,
          capUsd: 100,
          noCap: false,
        })}
        pendingUnits={100}
      />,
    );
    fireEvent.focus(screen.getByRole("group", { name: "Processor" }));
    const tooltip = within(screen.getByRole("tooltip"));
    expect(
      tooltip.getByRole("progressbar", { name: "Free credits remaining" }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(
      tooltip.getByRole("progressbar", { name: "Paid metered usage" }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(tooltip.getByText("500 of 1,000")).toBeInTheDocument();
    expect(tooltip.getByText("$25.00 / $100")).toBeInTheDocument();
  });
  it("hides an absent included pool while retaining metered billing", () => {
    render(
      <ProcessorPlanRow wallet={on({ freeAllowance: 0, freeRemaining: 0 })} />,
    );
    expect(screen.queryByText("Included credits")).not.toBeInTheDocument();
    expect(screen.queryByText("0 of 0 used")).not.toBeInTheDocument();
    expect(screen.getByText("Processor")).toBeInTheDocument();
  });

  it("keeps activation available when there is no included pool", () => {
    render(
      <ProcessorPlanRow
        wallet={off({ freeAllowance: 0, freeRemaining: 0 })}
        onActivate={() => {}}
      />,
    );
    expect(screen.queryByText("0 of 0 used")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch on the Processor" }),
    ).toBeInTheDocument();
  });
  it("shows only the Processor row when the metered limit is zero", () => {
    render(
      <ProcessorPlanRow
        wallet={on({
          capUsd: 0,
          noCap: false,
          estimatedBillMinor: 0,
          freeAllowance: 2500,
          freeRemaining: 2200,
        })}
      />,
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(
      screen.getByText("$0.00 of $0 metered this cycle"),
    ).toBeInTheDocument();
    expect(screen.queryByText("300 of 2,500 used")).not.toBeInTheDocument();
    expect(screen.getAllByText("Processor")).toHaveLength(1);
  });
  it("does not add a separate included-credit row while metering is on", () => {
    render(
      <ProcessorPlanRow
        wallet={on({
          freeAllowance: 2700,
          freeRemaining: 2300,
          includedPeriodEnd: "2026-10-01",
        })}
        pendingUnits={25}
      />,
    );
    expect(screen.queryByText("Included credits")).not.toBeInTheDocument();
    expect(screen.queryByText("425 of 2,700 used")).not.toBeInTheDocument();
    expect(screen.getAllByText("Processor")).toHaveLength(1);
  });

  it("sells while off: the grant drains towards the activation door", () => {
    render(
      <ProcessorPlanRow
        wallet={off({ freeRemaining: 380, freeAllowance: 500 })}
        onActivate={() => {}}
      />,
    );

    expect(screen.getByText("120 of 500 used")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch on the Processor" }),
    ).toBeInTheDocument();
  });

  it("counts pending instance units as used rather than ignoring them", () => {
    render(
      <ProcessorPlanRow
        wallet={off({ freeRemaining: 380, freeAllowance: 500 })}
        pendingUnits={148}
      />,
    );

    // Blind to the unsynced units this would read 120 and overstate the headroom by exactly 148.
    expect(screen.getByText("268 of 500 used")).toBeInTheDocument();
  });

  it("never reports more used than the grant holds", () => {
    render(
      <ProcessorPlanRow
        wallet={off({ freeRemaining: 20, freeAllowance: 500 })}
        pendingUnits={9999}
      />,
    );

    expect(screen.getByText("500 of 500 used")).toBeInTheDocument();
  });

  it("governs while on, converting minor units to the limit's major scale", () => {
    render(
      <ProcessorPlanRow
        wallet={on({ estimatedBillMinor: 4500, capUsd: 1000, noCap: false })}
        onGovern={() => {}}
      />,
    );

    // 4500 minor is $45 against a $1,000 limit: 5%, not 450%.
    expect(
      screen.getByText("$45.00 of $1,000 metered this cycle"),
    ).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Raise limit" }),
    ).toBeInTheDocument();
  });

  it("says so rather than showing zero when the rate is unknown", () => {
    render(<ProcessorPlanRow wallet={on({ estimatedBillMinor: null })} />);
    expect(screen.getByText("Metered this cycle")).toBeInTheDocument();
  });

  it("drops the track when there is no spend limit", () => {
    const { container } = render(
      <ProcessorPlanRow wallet={on({ noCap: true, capUsd: null })} />,
    );

    expect(screen.getByText("no limit")).toBeInTheDocument();
    expect(container.querySelectorAll(".billing-meter__fill")).toHaveLength(0);
  });

  it("leads with a live prepaid pool, because the meter cannot move until it empties", () => {
    render(
      <ProcessorPlanRow
        wallet={on({
          prepaidUnitsRemaining: 78_000,
          prepaidUnitsTotal: 120_000,
          prepaidExpiresAt: "2027-03-01",
          estimatedBillMinor: 0,
          capUsd: 1000,
          noCap: false,
        })}
        onGovern={() => {}}
      />,
    );

    expect(screen.getByText("78,000 left")).toBeInTheDocument();
    expect(
      screen.getByText(/Prepaid credits, drawn before metered billing/),
    ).toBeInTheDocument();
    // The metered headline would read "$0.00 of $1,000", which says nothing while the pool lasts.
    expect(screen.queryByText(/metered this cycle/)).not.toBeInTheDocument();
  });

  it("carries the free grant and the meter behind the prepaid headline", () => {
    render(
      <ProcessorPlanRow
        wallet={on({
          freeAllowance: 500,
          freeRemaining: 500,
          prepaidUnitsRemaining: 60_000,
          prepaidUnitsTotal: 120_000,
          estimatedBillMinor: 0,
          capUsd: 1000,
          noCap: false,
        })}
      />,
    );
    fireEvent.focus(screen.getByRole("group", { name: "Processor" }));
    const tooltip = within(screen.getByRole("tooltip"));
    expect(
      tooltip.getByRole("progressbar", { name: "Free credits remaining" }),
    ).toHaveAttribute("aria-valuenow", "100");
    expect(
      tooltip.getByRole("progressbar", { name: "Prepaid credits remaining" }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(
      tooltip.getByRole("progressbar", { name: "Paid metered usage" }),
    ).toHaveAttribute("aria-valuenow", "0");
  });

  it("draws pending units through the free grant before the prepaid pool", () => {
    render(
      <ProcessorPlanRow
        wallet={on({
          freeAllowance: 500,
          freeRemaining: 500,
          prepaidUnitsRemaining: 1000,
          prepaidUnitsTotal: 1000,
        })}
        pendingUnits={700}
      />,
    );

    // 500 clears the grant, so only the remaining 200 touch the pool.
    expect(screen.getByText("800 left")).toBeInTheDocument();
  });

  it("hands the row back to the meter once the pool is spent, and says why", () => {
    render(
      <ProcessorPlanRow
        wallet={on({
          prepaidUnitsRemaining: 0,
          prepaidUnitsTotal: 120_000,
          estimatedBillMinor: 4500,
          capUsd: 1000,
          noCap: false,
        })}
        onGovern={() => {}}
      />,
    );

    expect(
      screen.getByText("$45.00 of $1,000 metered this cycle"),
    ).toBeInTheDocument();
    fireEvent.focus(screen.getByRole("group", { name: "Processor" }));
    const tooltip = within(screen.getByRole("tooltip"));
    expect(tooltip.getByText("0 of 120,000")).toBeInTheDocument();
    expect(
      tooltip.getByText("Used up, metered billing has resumed"),
    ).toBeInTheDocument();
  });

  it("keeps the activation door while a pool runs without a subscription", () => {
    render(
      <ProcessorPlanRow
        wallet={off({
          prepaidUnitsRemaining: 40_000,
          prepaidUnitsTotal: 120_000,
        })}
        onActivate={() => {}}
      />,
    );

    expect(screen.getByText("40,000 left")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch on the Processor" }),
    ).toBeInTheDocument();
  });

  it("shows no prepaid tranche for a team that never bought one", () => {
    render(
      <ProcessorPlanRow
        wallet={on({ freeAllowance: 500, freeRemaining: 200 })}
      />,
    );
    fireEvent.focus(screen.getByRole("group", { name: "Processor" }));
    expect(
      within(screen.getByRole("tooltip")).queryByRole("progressbar", {
        name: "Prepaid credits remaining",
      }),
    ).not.toBeInTheDocument();
  });

  it("lets a prepaid team's door be relabelled without changing the row", () => {
    render(
      <ProcessorPlanRow
        wallet={on({ estimatedBillMinor: 4500, capUsd: 1000, noCap: false })}
        onGovern={() => {}}
        governLabel="Top up"
      />,
    );

    expect(screen.getByRole("button", { name: "Top up" })).toBeInTheDocument();
  });
});
