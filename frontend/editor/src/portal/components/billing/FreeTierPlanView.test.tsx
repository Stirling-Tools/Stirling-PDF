import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The unlinked usage page reads the instance's own ledger and nothing else — no wallet, so no
 * claim about linkage — and it has to survive the endpoint being admin-only, since a non-admin can
 * hold a portal grant and reach this page.
 */
const { fetchFreeTier, openLinkModal } = vi.hoisted(() => ({
  fetchFreeTier: vi.fn(),
  openLinkModal: vi.fn(),
}));

vi.mock("@portal/api/link", () => ({ fetchFreeTier }));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal }),
}));
vi.mock("@portal/components/billing/FreePdfEditorsCard", () => ({
  FreePdfEditorsCard: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Interpolated so the figures themselves are what the assertions read.
    t: (_key: string, fallback: string, vars?: Record<string, unknown>) =>
      typeof fallback === "string" && vars
        ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(vars[n] ?? ""))
        : fallback,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { HttpError } from "@portal/api/http";
import { FreeTierPlanView } from "@portal/components/billing/FreeTierPlanView";

const BALANCE = {
  grantUnits: 500,
  usedUnits: 120,
  remainingUnits: 380,
  periodStart: "2026-09-01T00:00:00",
  periodEnd: "2026-10-01T00:00:00",
};

const renderView = () =>
  render(
    <PortalTestProviders>
      <MemoryRouter>
        <FreeTierPlanView />
      </MemoryRouter>
    </PortalTestProviders>,
  );

describe("FreeTierPlanView", () => {
  beforeEach(() => {
    fetchFreeTier.mockReset();
    openLinkModal.mockReset();
  });

  it("renders the local meter: used, grant, remaining and when it resets", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    renderView();
    expect(await screen.findByText("380")).toBeInTheDocument();
    expect(
      screen.getByText("of 500 free credits left this month"),
    ).toBeInTheDocument();
    expect(screen.getByText("120 used")).toBeInTheDocument();
    expect(screen.getByText(/^Resets /)).toBeInTheDocument();
  });

  it("reads only the instance's own ledger", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    renderView();
    await screen.findByText("380");
    expect(fetchFreeTier).toHaveBeenCalledTimes(1);
  });

  it("offers the account as more allowance, and asks for it only on request", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    renderView();
    await screen.findByText("380");
    expect(openLinkModal).not.toHaveBeenCalled();
    expect(screen.getByText("Connect a Stirling account")).toBeInTheDocument();
  });

  it("tells a non-admin the figures are not theirs to see, rather than failing", async () => {
    fetchFreeTier.mockRejectedValue(new HttpError(403, "Forbidden", null));
    renderView();
    expect(
      await screen.findByText(/only an administrator/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load credit usage")).toBeNull();
  });

  it("reports a real failure as one", async () => {
    fetchFreeTier.mockRejectedValue(new HttpError(500, "Server Error", null));
    renderView();
    expect(
      await screen.findByText("Couldn't load credit usage"),
    ).toBeInTheDocument();
  });
});
