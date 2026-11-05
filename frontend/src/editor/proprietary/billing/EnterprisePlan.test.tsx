import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { TeamPlanRow } from "@editor/billing/TeamPlanRow";
import { ProcessorPlanRow } from "@editor/billing/ProcessorPlanRow";
import { BillingScreen } from "@editor/billing/BillingScreen";
import { freeWallet } from "@editor/billing/walletFixtures";
import type { Wallet } from "@editor/billing/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string | Record<string, unknown>,
      vars?: Record<string, unknown>,
    ) => {
      const copy: Record<string, string> = {
        "portal.billing.enterprise.usersAgreed":
          "{{used}} / {{agreed}} agreed users",
        "portal.billing.enterprise.usersOver":
          "{{count}} users over agreed quantity",
        "portal.billing.enterprise.pdfsAgreed": "{{used}} / {{agreed}} PDFs",
        "portal.billing.enterprise.pdfsOver":
          "{{count}} PDFs over agreed volume",
        "portal.billing.enterprise.trial": "{{days}}-day trial · ends {{date}}",
        "portal.billing.enterprise.included": "Included in Enterprise",
      };
      const values = typeof fallback === "object" ? fallback : vars;
      return (
        copy[key] ?? (typeof fallback === "string" ? fallback : key)
      ).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(values?.[k] ?? ""));
    },
  }),
}));

const wallet: Wallet = {
  ...freeWallet,
  team: { ...freeWallet.team, usersInUse: 27 },
  enterprise: {
    status: "active",
    periodStart: "2026-10-12T00:00:00Z",
    periodEnd: "2027-10-12T00:00:00Z",
    accessUntil: "2027-10-12T00:00:00Z",
    agreedSeats: 20,
    annualVolume: 1000,
    pdfsUsed: 1250,
  },
};

it("shows actual users and PDFs over the agreement without selling more capacity", () => {
  render(
    <MantineProvider>
      <TeamPlanRow wallet={wallet} onAddCapacity={vi.fn()} />
      <ProcessorPlanRow
        wallet={wallet}
        onActivate={vi.fn()}
        onGovern={vi.fn()}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("27 / 20 agreed users")).toBeInTheDocument();
  expect(screen.getByText("7 users over agreed quantity")).toBeInTheDocument();
  expect(screen.getByText("1,250 / 1,000 PDFs")).toBeInTheDocument();
  expect(screen.getByText("250 PDFs over agreed volume")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("identifies the trial and its end date even when the underlying wallet is free", () => {
  render(
    <MantineProvider>
      <BillingScreen
        wallet={{
          ...wallet,
          enterprise: {
            ...wallet.enterprise!,
            status: "trial",
            accessUntil: "2026-10-26T00:00:00Z",
            periodEnd: "2026-10-26T00:00:00Z",
            annualVolume: null,
          },
        }}
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Enterprise")).toBeInTheDocument();
  expect(screen.getByText(/14-day trial.*ends.*26/)).toBeInTheDocument();
  expect(screen.queryByText("Activate Processor")).not.toBeInTheDocument();
});
