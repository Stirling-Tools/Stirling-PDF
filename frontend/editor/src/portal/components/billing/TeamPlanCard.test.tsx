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

import { TeamPlanCard } from "@portal/components/billing/TeamPlanCard";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import type { TeamHolding } from "@portal/api/billing";

const renderCard = (ui: ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

const withTeam = (team: TeamHolding) => ({ ...subscribedWallet, team });

describe("TeamPlanCard", () => {
  it("offers Team when the team holds none, and still reports the real member count", () => {
    renderCard(
      <TeamPlanCard
        wallet={withTeam({ held: false, licensedUsers: null, usersInUse: 4 })}
        onBuy={() => {}}
      />,
    );

    expect(screen.getByText("No Team plan")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Team" }),
    ).toBeInTheDocument();
  });

  it("gives a member the same figures with no purchase action", () => {
    renderCard(
      <TeamPlanCard
        wallet={withTeam({ held: false, licensedUsers: null, usersInUse: 4 })}
      />,
    );

    expect(screen.getByText("No Team plan")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("meters members against the licensed count when Team is held", () => {
    renderCard(
      <TeamPlanCard
        wallet={withTeam({ held: true, licensedUsers: 100, usersInUse: 34 })}
      />,
    );

    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("of 100 users")).toBeInTheDocument();
    expect(screen.getByText("Room to grow")).toBeInTheDocument();
  });

  it("warns before the cap is reached", () => {
    renderCard(
      <TeamPlanCard
        wallet={withTeam({ held: true, licensedUsers: 100, usersInUse: 87 })}
      />,
    );

    expect(screen.getByText("Nearly full")).toBeInTheDocument();
  });

  it("reads over capacity as a state, not an error, and says existing members keep working", () => {
    renderCard(
      <TeamPlanCard
        wallet={withTeam({ held: true, licensedUsers: 100, usersInUse: 137 })}
      />,
    );

    expect(screen.getByText("Over capacity")).toBeInTheDocument();
    expect(
      screen.getByText(/Existing members keep working/),
    ).toBeInTheDocument();
  });

  it("shows no denominator and no bar for an unlimited holding", () => {
    const { container } = renderCard(
      <TeamPlanCard
        wallet={withTeam({ held: true, licensedUsers: null, usersInUse: 240 })}
      />,
    );

    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.getByText("users, no limit")).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    // A bar would imply headroom that no limit can express.
    expect(container.querySelector(".payg-bar")).toBeNull();
  });
});
