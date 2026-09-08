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

import { TeamPlanRow } from "@app/billing/TeamPlanRow";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
import type { TeamHolding, Wallet } from "@app/billing/types";

const w = (team: TeamHolding, over: Partial<Wallet> = {}): Wallet => ({
  ...subscribedWallet,
  team,
  ...over,
});

describe("TeamPlanRow", () => {
  it("names the row for what it measures and offers the capacity door", () => {
    const { container } = render(
      <TeamPlanRow
        wallet={w({ held: true, licensedUsers: 100, usersInUse: 34 })}
        onAddCapacity={() => {}}
      />,
    );

    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("34 of 100 users")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add capacity" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".billing-meter--paid")).not.toBeNull();
  });

  it("gives a member the same fact with no door", () => {
    render(
      <TeamPlanRow
        wallet={w({ held: true, licensedUsers: 100, usersInUse: 34 })}
      />,
    );

    expect(screen.getByText("34 of 100 users")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("turns amber only once the capacity is paid for", () => {
    const paid = render(
      <TeamPlanRow
        wallet={w({ held: true, licensedUsers: 100, usersInUse: 95 })}
      />,
    );
    expect(paid.container.querySelector(".billing-meter--warn")).not.toBeNull();
    paid.unmount();

    // A free tier filling up is the product working as intended, not a warning.
    const free = render(
      <TeamPlanRow
        wallet={w({ held: false, licensedUsers: 5, usersInUse: 5 }, freeWallet)}
      />,
    );
    expect(free.container.querySelector(".billing-meter--warn")).toBeNull();
  });

  it("prices Team only when the plan identity above does not", () => {
    // Team alone: the identity reads "Team, up to 100 users" and carries no price, so the row does.
    const alone = render(
      <TeamPlanRow
        wallet={w(
          { held: true, licensedUsers: 100, usersInUse: 4 },
          { processor: { active: false } },
        )}
      />,
    );
    expect(screen.getByText("$99/mo per 100 users")).toBeInTheDocument();
    alone.unmount();

    // With the Processor the identity already carries the base, so the row must not re-price it.
    render(
      <TeamPlanRow
        wallet={w(
          { held: true, licensedUsers: 100, usersInUse: 4 },
          { processor: { active: true } },
        )}
      />,
    );
    expect(
      screen.getByText("Included with your Team base"),
    ).toBeInTheDocument();
    expect(screen.queryByText("$99/mo per 100 users")).not.toBeInTheDocument();
  });

  it("phrases the free tier per edition", () => {
    const cloud = render(
      <TeamPlanRow
        wallet={w(
          { held: false, licensedUsers: null, usersInUse: 1 },
          freeWallet,
        )}
      />,
    );
    expect(
      screen.getByText("The Team plan covers 100 users"),
    ).toBeInTheDocument();
    cloud.unmount();

    render(
      <TeamPlanRow
        selfHosted
        wallet={w(
          { held: false, licensedUsers: null, usersInUse: 1 },
          freeWallet,
        )}
      />,
    );
    expect(
      screen.getByText("The free tier covers your first users"),
    ).toBeInTheDocument();
  });

  it("drops the track when there is no limit to meter against", () => {
    const { container } = render(
      <TeamPlanRow
        wallet={w({ held: true, licensedUsers: null, usersInUse: 240 })}
      />,
    );

    expect(screen.getByText("240 users")).toBeInTheDocument();
    // A track with no denominator would claim headroom the absent limit cannot support.
    expect(container.querySelector(".billing-meter__fill")).toBeNull();
  });
});
