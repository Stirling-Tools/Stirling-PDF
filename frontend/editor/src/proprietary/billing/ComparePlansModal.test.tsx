import { expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

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
import { ComparePlansModal } from "@app/billing/ComparePlansModal";
import { freeWallet } from "@app/billing/walletFixtures";

/** Both @app/ui controls the matrix uses are Mantine-backed, so they need its provider. */
const render = (ui: ReactNode) =>
  rtlRender(<MantineProvider>{ui}</MantineProvider>);

function open(props: Partial<Parameters<typeof ComparePlansModal>[0]> = {}) {
  return render(
    <ComparePlansModal
      open
      onClose={() => {}}
      currentPlan="free"
      freeUserLimit={5}
      freeAllowance={500}
      {...props}
    />,
  );
}

it("quotes the figures it was given rather than a fixed number", () => {
  open({ freeUserLimit: 12, freeAllowance: 1000 });
  expect(screen.getByText("Up to 12")).toBeInTheDocument();
  expect(screen.getByText("1,000 credits a month")).toBeInTheDocument();
});

it.each([null, 0])(
  "describes the allowance in words when the host reports %s",
  (allowance) => {
    open({ freeUserLimit: null, freeAllowance: allowance as number | null });
    expect(screen.getByText("A monthly credit allowance")).toBeInTheDocument();
    expect(screen.getByText("A small team")).toBeInTheDocument();
  },
);

it("states the shape of Team's allowance when no figure is available", () => {
  open();
  expect(
    screen.getByText("A larger allowance, then metered"),
  ).toBeInTheDocument();
});

it("marks only the caller's own plan", () => {
  open({ currentPlan: "team" });
  const marks = screen.getAllByText("Current");
  expect(marks).toHaveLength(1);
  expect(marks[0].closest("th")).toHaveTextContent("Team");
});

/** SSO is on every plan, so the row must not imply Team adds anything to sign-in. */
it("does not sell Team on sign-in", () => {
  open();
  expect(screen.getByText("Email, Google and SSO")).toBeInTheDocument();
  expect(screen.getByText("The same")).toBeInTheDocument();
  expect(screen.getByText("SAML and auditing")).toBeInTheDocument();
});

it("drops a door the host did not open", () => {
  open({ onUpgradeTeam: undefined, onExploreEnterprise: undefined });
  expect(screen.queryByText("Upgrade to Team")).not.toBeInTheDocument();
  expect(screen.queryByText("Explore Enterprise")).not.toBeInTheDocument();
});

/**
 * The close and the hand-off land in one commit, so the matrix never sits over the flow it
 * started. They are not ordered within the handler, and nothing should depend on that.
 */
it("leaves the matrix closed once the procurement flow is away", () => {
  const onExploreEnterprise = vi.fn();
  render(
    <BillingScreen
      wallet={freeWallet}
      onEnterpriseQuote={onExploreEnterprise}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare plans" }));
  expect(screen.getByText("Where it runs")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Explore Enterprise" }));
  expect(onExploreEnterprise).toHaveBeenCalledOnce();
  expect(screen.queryByText("Where it runs")).not.toBeInTheDocument();
});

/**
 * A local Server licence sits in the Team column while its wallet is still free, so the grant the
 * wallet reports is the free one and must not be quoted as what Team includes.
 */
it("does not quote a free grant as a Server licence's Team allowance", () => {
  render(
    <BillingScreen
      wallet={{ ...freeWallet, freeAllowance: 1000 }}
      serverPlan={{ licenseType: "SERVER", maxUsers: 100, usersInUse: 12 }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare plans" }));
  expect(
    screen.queryByText("1,000 a month, then metered"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("A larger allowance, then metered"),
  ).toBeInTheDocument();
  expect(screen.getByText("1,000 credits a month")).toBeInTheDocument();
});

/** An Enterprise licence needs neither door, and the enterprise banner already gates itself. */
it("sells nothing to an enterprise licence", () => {
  render(
    <BillingScreen
      wallet={freeWallet}
      serverPlan={{ licenseType: "ENTERPRISE", maxUsers: 0, usersInUse: 12 }}
      onAddCapacity={() => {}}
      onEnterpriseQuote={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare plans" }));
  expect(screen.getByText("Where it runs")).toBeInTheDocument();
  expect(screen.queryByText("Upgrade to Team")).not.toBeInTheDocument();
  expect(screen.queryByText("Explore Enterprise")).not.toBeInTheDocument();
});

it("keeps the free user ceiling in the Free column for a team that holds Team", () => {
  render(
    <BillingScreen
      wallet={{
        ...freeWallet,
        freeUserAllowance: 5,
        team: { held: true, licensedUsers: 100, usersInUse: 6 },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare plans" }));
  expect(screen.getByText("Up to 5")).toBeInTheDocument();
  expect(screen.queryByText("A small team")).not.toBeInTheDocument();
});

it("offers no upgrade to a team that already holds one", () => {
  render(
    <BillingScreen
      wallet={{
        ...freeWallet,
        team: { held: true, licensedUsers: 100, usersInUse: 6 },
      }}
      onAddCapacity={() => {}}
      onEnterpriseQuote={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare plans" }));
  expect(screen.queryByText("Upgrade to Team")).not.toBeInTheDocument();
  expect(screen.getByText("Explore Enterprise")).toBeInTheDocument();
});
