import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BillingScreen } from "@app/billing/BillingScreen";
import { freeWallet } from "@app/billing/walletFixtures";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe("seat breakdown", () => {
  it("explains the exempt owner and substitutes the live local roster for its stale report", () => {
    render(
      <BillingScreen
        wallet={{
          ...freeWallet,
          team: {
            ...freeWallet.team,
            fleet: true,
            breakdown: {
              cloudUsers: 0,
              excludedOwners: 1,
              deployments: [
                {
                  deviceId: "here",
                  name: "Office",
                  users: 2,
                  reportedAt: "2026-09-18T09:00:00Z",
                },
                {
                  deviceId: "away",
                  name: "Remote office",
                  users: null,
                  reportedAt: null,
                },
              ],
            },
          },
        }}
        deviceId="here"
        usersInUse={5}
        userLimit={5}
      />,
    );
    fireEvent.focus(screen.getByRole("group", { name: "Users" }));
    const tooltip = within(screen.getByRole("tooltip"));
    expect(
      tooltip.getByText("The required cloud team owner does not use a seat."),
    ).toBeInTheDocument();
    expect(tooltip.getByText("This server")).toBeInTheDocument();
    expect(tooltip.getByText("5")).toBeInTheDocument();
    expect(tooltip.queryByText("2")).not.toBeInTheDocument();
    expect(tooltip.getByText("Remote office")).toBeInTheDocument();
    expect(tooltip.getByText("Not yet reported")).toBeInTheDocument();
    expect(
      tooltip.getByText(
        "Waiting for its daily sync; not yet included in the fleet total.",
      ),
    ).toBeInTheDocument();
  });
});
