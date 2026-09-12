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
    expect(screen.getByText("$45.00 metered this cycle")).toBeInTheDocument();
    expect(screen.getByText("5% of $1,000")).toBeInTheDocument();
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
    expect(container.querySelector(".billing-meter__fill")).toBeNull();
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
