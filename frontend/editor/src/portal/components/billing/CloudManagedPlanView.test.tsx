import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import type { CloudPlan } from "@portal/api/link";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
        String(values?.[key] ?? ""),
      ),
    i18n: { language: "en-US" },
  }),
}));
const fetchCloudPlan = vi.hoisted(() => vi.fn());
const applyLinkFacts = vi.hoisted(() => vi.fn());
vi.mock("@portal/api/link", () => ({ fetchCloudPlan }));
vi.mock("@portal/contexts/LinkContext", () => ({
  useApplyLinkFacts: () => applyLinkFacts,
}));
vi.mock("@portal/components/account-link/AccountConnectionNotice", () => ({
  AccountConnectionNotice: () => null,
}));
vi.mock("@portal/components/account-link/cloudLinks", () => ({
  cloudUrl: (path: string) => `https://cloud.example${path}`,
}));

import { CloudManagedPlanView } from "@app/portal/components/billing/CloudManagedPlanView";

const plan: CloudPlan = {
  known: true,
  subscribed: true,
  freeRemainingUnits: 0,
  prepaidRemainingUnits: 0,
  periodSpendUnits: 1200,
  periodCapUnits: 5000,
  state: "OK",
  periodStart: "2026-10-01T00:00:00",
  periodEnd: "2026-11-01T00:00:00",
  licensedUsers: null,
  unsyncedUnits: 34,
};

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <CloudManagedPlanView licenseSection={<div>license row</div>} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("CloudManagedPlanView", () => {
  beforeEach(() => {
    fetchCloudPlan.mockReset().mockResolvedValue(plan);
    applyLinkFacts.mockReset();
  });

  it("shows the plan read-only and sends changes to stirling.com", async () => {
    mount();
    expect(await screen.findByText("Processor")).toBeInTheDocument();
    // Synced spend plus what this server has not reported yet.
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText(/34 not yet synced/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Manage billing on stirling.com/ }),
    ).toHaveAttribute("href", "https://cloud.example/settings/billing");
    expect(screen.getByText("license row")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limit/i })).toBeNull();
  });

  it("feeds the tier from the cached plan, since there is no wallet to read", async () => {
    mount();
    await screen.findByText("Processor");
    expect(applyLinkFacts).toHaveBeenCalledWith(true, true);
  });

  it("says who can lift a reached limit", async () => {
    fetchCloudPlan.mockResolvedValue({ ...plan, state: "OVER_LIMIT" });
    mount();
    expect(await screen.findByText("Spend limit reached")).toBeInTheDocument();
  });

  it("waits for the first check-in rather than showing zeros", async () => {
    fetchCloudPlan.mockResolvedValue({ ...plan, known: false });
    mount();
    expect(
      await screen.findByText(/once this server has checked in/),
    ).toBeInTheDocument();
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });
});
