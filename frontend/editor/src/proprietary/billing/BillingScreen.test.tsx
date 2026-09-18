import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";

it.each([4, 0])(
  "keeps standalone users against the enforced allowance of %i",
  (limit) => {
    render(
      <BillingScreen
        wallet={{
          ...freeWallet,
          team: {
            held: false,
            licensedUsers: null,
            usersInUse: 1,
            fleet: false,
          },
        }}
        usersInUse={5}
        userLimit={limit}
      />,
    );
    expect(screen.getByText(`5 of ${limit} users`)).toBeInTheDocument();
    expect(
      screen.getByText("Capacity available to this server"),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 of 5 users")).not.toBeInTheDocument();
  },
);

it("shows shared fleet usage and full purchased capacity despite a smaller local allowance", () => {
  render(
    <BillingScreen
      wallet={{
        ...freeWallet,
        team: { held: true, licensedUsers: 100, usersInUse: 83, fleet: true },
      }}
      usersInUse={7}
      userLimit={17}
    />,
  );
  expect(screen.getByText("83 of 100 users")).toBeInTheDocument();
  expect(screen.queryByText("7 of 100 users")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Capacity available to this server"),
  ).not.toBeInTheDocument();
});

it.each([null, 3, 5])(
  "replaces a local report of %s with live users in the fleet total",
  (reported) => {
    render(
      <BillingScreen
        wallet={{
          ...freeWallet,
          team: {
            held: true,
            licensedUsers: 100,
            usersInUse: (reported ?? 0) + 2,
            fleet: true,
            breakdown: {
              cloudUsers: 0,
              excludedOwners: 1,
              deployments: [
                {
                  deviceId: "one",
                  name: "Server One",
                  users: reported,
                  reportedAt: null,
                },
                {
                  deviceId: "two",
                  name: "Server Two",
                  users: 2,
                  reportedAt: null,
                },
              ],
            },
          },
        }}
        deviceId="one"
        usersInUse={5}
        userLimit={98}
      />,
    );
    expect(screen.getByText("7 of 100 users")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Users: 7 of 100 users" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("7", { selector: ".billing-kv__value" }),
    ).toBeInTheDocument();
  },
);

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
    expect(
      screen.getByText("1,250 used · includes free and prepaid credits"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "estimated · includes 250 not yet synced from your instances",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about syncing when there is nothing waiting", () => {
    render(<BillingScreen wallet={wallet} pendingUnits={0} />);

    expect(screen.getAllByText("$10.00")).toHaveLength(2);
    expect(
      screen.getByText("1,000 used · includes free and prepaid credits"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("estimated · the meter settles at close"),
    ).toBeInTheDocument();
  });
});

describe("installed server licences", () => {
  it("keeps Server unlimited while allowing Processor activation", () => {
    const activate = vi.fn();
    render(
      <BillingScreen
        wallet={freeWallet}
        serverPlan={{ licenseType: "SERVER", maxUsers: 9999, usersInUse: 34 }}
        onActivateProcessor={activate}
        onAddCapacity={() => {}}
        serverPlanAction={<button>Manage Billing</button>}
      />,
    );
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getByText("Unlimited users")).toBeInTheDocument();
    expect(screen.queryByText("Free")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add capacity" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage Billing" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch on the Processor" }),
    );
    expect(activate).toHaveBeenCalledOnce();
  });
  it("uses Enterprise seats and local users even with an active cloud Processor", () => {
    const govern = vi.fn();
    render(
      <BillingScreen
        wallet={subscribedWallet}
        serverPlan={{
          licenseType: "ENTERPRISE",
          maxUsers: 250,
          usersInUse: 37,
        }}
        onGovernSpend={govern}
      />,
    );
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getByText("37 of 250 users")).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("Included in your license")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Raise limit" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Credits")).not.toBeInTheDocument();
    expect(govern).not.toHaveBeenCalled();
  });
  it("includes Enterprise processing even when the cloud Processor is off", () => {
    render(
      <BillingScreen
        wallet={freeWallet}
        serverPlan={{ licenseType: "ENTERPRISE", maxUsers: 100, usersInUse: 1 }}
        onActivateProcessor={() => {}}
        activateLabel="View quote"
      />,
    );
    expect(screen.getByText("Included in your license")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch on the Processor" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View quote" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/of 500 used/)).not.toBeInTheDocument();
  });
  it("keeps the installed licence visible if the credit wallet is unavailable", () => {
    render(
      <BillingScreen
        wallet={null}
        serverPlan={{
          licenseType: "ENTERPRISE",
          maxUsers: 80,
          usersInUse: null,
        }}
        serverPlanAction={<button>Manage Billing</button>}
      />,
    );
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getByText("80 licensed seats")).toBeInTheDocument();
    expect(screen.getByText("Included in your license")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage Billing" }),
    ).toBeInTheDocument();
  });
});

it("shows the net charge consistently when gross usage includes allowances", () => {
  render(
    <BillingScreen
      wallet={{
        ...subscribedWallet,
        spendUnitsThisPeriod: 2000,
        estimatedBillMinor: 4000,
        pricePerDocMinor: 2,
        freeRemaining: 100,
        prepaidUnitsRemaining: 150,
      }}
      pendingUnits={500}
    />,
  );
  expect(screen.getAllByText("$45.00")).toHaveLength(2);
  expect(
    screen.getByText("2,500 used · includes free and prepaid credits"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/each/)).not.toBeInTheDocument();
});

it("does not price gross usage as paid usage", () => {
  render(
    <BillingScreen
      wallet={{
        ...subscribedWallet,
        spendUnitsThisPeriod: 2000,
        estimatedBillMinor: 3000,
        pricePerDocMinor: 2,
      }}
    />,
  );
  expect(screen.getAllByText("$30.00")).toHaveLength(2);
  expect(screen.queryByText("$40.00")).not.toBeInTheDocument();
});
