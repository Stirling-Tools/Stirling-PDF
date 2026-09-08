import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactElement } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, def?: string, vars?: Record<string, unknown>) =>
      def && vars
        ? def.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""))
        : (def ?? _key),
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { ProcessorPlanCard } from "@app/billing/ProcessorPlanCard";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
import type { Wallet } from "@app/billing/types";

const renderCard = (ui: ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

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

describe("ProcessorPlanCard", () => {
  it("shows the free grant and offers activation when the Processor is off", () => {
    renderCard(
      <ProcessorPlanCard
        wallet={off({ freeRemaining: 380, freeAllowance: 500 })}
        onActivate={() => {}}
      />,
    );

    expect(screen.getByText("380")).toBeInTheDocument();
    expect(
      screen.getByText("of 500 free credits this period"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch on" }),
    ).toBeInTheDocument();
  });

  it("draws pending instance units down from the free grant rather than ignoring them", () => {
    renderCard(
      <ProcessorPlanCard
        wallet={off({ freeRemaining: 380, freeAllowance: 500 })}
        pendingUnits={148}
      />,
    );

    // 380 unsynced-blind would overstate the headroom by exactly the pending units.
    expect(screen.getByText("232")).toBeInTheDocument();
    expect(
      screen.getByText(/148 meter units are still pending/),
    ).toBeInTheDocument();
  });

  it("never reports negative headroom when pending units exceed what is left", () => {
    renderCard(
      <ProcessorPlanCard
        wallet={off({ freeRemaining: 20, freeAllowance: 500 })}
        pendingUnits={999}
      />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Used up")).toBeInTheDocument();
  });

  it("gives a member no activation action", () => {
    renderCard(<ProcessorPlanCard wallet={off()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("meters spend against the limit, converting minor units to the cap's major scale", () => {
    renderCard(
      <ProcessorPlanCard
        wallet={on({ estimatedBillMinor: 4500, capUsd: 1000, noCap: false })}
      />,
    );

    // 4500 minor is $45, not $4,500: the comparison has to convert exactly once.
    expect(screen.getByText("$45.00")).toBeInTheDocument();
    expect(screen.getByText("of a $1,000 limit")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("reports an unknown rate as unknown rather than as zero spend", () => {
    renderCard(<ProcessorPlanCard wallet={on({ estimatedBillMinor: null })} />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows no bar when there is no spend limit to meter against", () => {
    const { container } = renderCard(
      <ProcessorPlanCard wallet={on({ noCap: true, capUsd: null })} />,
    );

    expect(screen.getByText("this period, no limit")).toBeInTheDocument();
    expect(container.querySelector(".payg-bar")).toBeNull();
  });
});
