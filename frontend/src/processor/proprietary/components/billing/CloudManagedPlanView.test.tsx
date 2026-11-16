import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PortalTestProviders } from "@processor/test/TestQueryProvider";
import type { CloudPlan } from "@processor/api/link";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      typeof fallback === "string"
        ? fallback.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
            String(values?.[key] ?? ""),
          )
        : _key,
    i18n: { language: "en-US", changeLanguage: vi.fn() },
  }),
}));
const fetchCloudPlan = vi.hoisted(() => vi.fn());
const applyLinkFacts = vi.hoisted(() => vi.fn());
vi.mock("@processor/api/link", () => ({ fetchCloudPlan }));
vi.mock("@processor/contexts/LinkContext", () => ({
  useApplyLinkFacts: () => applyLinkFacts,
}));
vi.mock("@processor/components/account-link/AccountConnectionNotice", () => ({
  AccountConnectionNotice: () => null,
}));
vi.mock("@processor/queries/infrastructure", () => ({
  useFleetStats: () => ({
    data: { editorsDeployed: 1, pdfsProcessed: 7 },
    loading: false,
    error: null,
  }),
}));
const linkStatus = vi.hoisted(() => ({
  current: { cloudAppUrl: "https://linked.example/app" } as {
    cloudAppUrl: string | null;
  } | null,
}));
vi.mock("@processor/contexts/AccountLinkContext", () => ({
  useAccountLinkOptional: () =>
    linkStatus.current ? { status: linkStatus.current } : null,
}));

import { CloudManagedPlanView } from "@editor/portal/components/billing/CloudManagedPlanView";

const free: CloudPlan = {
  known: true,
  subscribed: false,
  freeRemainingUnits: 380,
  prepaidRemainingUnits: 0,
  periodSpendUnits: 120,
  periodCapUnits: 500,
  state: "OK",
  periodStart: "2026-11-01T00:00:00",
  periodEnd: "2026-12-01T00:00:00",
  licensedUsers: null,
  unsyncedUnits: 0,
  freeAllowanceUnits: 500,
};

function mount() {
  return render(
    <PortalTestProviders>
      <CloudManagedPlanView
        usersInUse={1}
        userLimit={5}
        licenseSection={<div>license row</div>}
      />
    </PortalTestProviders>,
  );
}

describe("CloudManagedPlanView", () => {
  const open = vi.spyOn(window, "open");

  beforeEach(() => {
    fetchCloudPlan.mockReset().mockResolvedValue(free);
    applyLinkFacts.mockReset();
    open.mockReset().mockReturnValue(null);
  });
  afterEach(() => open.mockReset());

  it("shows the cloud's billing screen from the cached plan", async () => {
    mount();
    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByText("500 free credits monthly")).toBeInTheDocument();
    expect(screen.getByText("120 of 500 used")).toBeInTheDocument();
    expect(screen.getByText("1 of 5 users")).toBeInTheDocument();
    expect(screen.getByText("PDFs processed")).toBeInTheDocument();
    expect(screen.getByText("Editors deployed")).toBeInTheDocument();
    expect(screen.getByText("license row")).toBeInTheDocument();
    expect(screen.queryByText("Upgrade to Team")).toBeNull();
  });

  it("opens Stirling Cloud from every action", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add capacity" }),
    );
    expect(open).toHaveBeenLastCalledWith(
      "https://linked.example/app/team",
      "_blank",
      "noopener,noreferrer",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Switch on the Processor" }),
    );
    expect(open).toHaveBeenLastCalledWith(
      "https://linked.example/app/settings/billing",
      "_blank",
      "noopener,noreferrer",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Get an enterprise quote" }),
    );
    expect(open).toHaveBeenLastCalledWith(
      "https://linked.example/app/enterprise",
      "_blank",
      "noopener,noreferrer",
    );
    expect(
      screen.getByRole("link", { name: /Manage billing in Stirling Cloud/ }),
    ).toHaveAttribute("href", "https://linked.example/app/settings/billing");
  });

  it("states a subscribed team's limit in credits, since no price is sent", async () => {
    fetchCloudPlan.mockResolvedValue({
      ...free,
      subscribed: true,
      freeRemainingUnits: 0,
      periodSpendUnits: 1200,
      periodCapUnits: 5000,
      unsyncedUnits: 34,
    });
    mount();
    // Synced spend plus what this server has not reported yet.
    const row = await screen.findByText(
      "1,234 of 5,000 credits metered this cycle",
    );
    expect(
      within(row.parentElement as HTMLElement).getByText("25%"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Raise limit" }));
    expect(open).toHaveBeenLastCalledWith(
      "https://linked.example/app/settings/billing",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("feeds the tier from the cached plan, since there is no wallet to read", async () => {
    fetchCloudPlan.mockResolvedValue({ ...free, subscribed: true });
    mount();
    await screen.findByText("Processor", { selector: ".billing-id__name" });
    expect(applyLinkFacts).toHaveBeenCalledWith(true, true);
  });

  it("says who can lift a reached limit", async () => {
    fetchCloudPlan.mockResolvedValue({ ...free, state: "OVER_LIMIT" });
    mount();
    expect(await screen.findByText("Spend limit reached")).toBeInTheDocument();
  });

  it("waits for the first check-in rather than showing zeros", async () => {
    fetchCloudPlan.mockResolvedValue({ ...free, known: false });
    mount();
    expect(
      await screen.findByText(/once this server has checked in/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/of 500 used/)).toBeNull();
    expect(applyLinkFacts).not.toHaveBeenCalled();
  });
});
