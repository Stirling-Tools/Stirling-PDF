import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The unlinked usage page renders the shared billing screen from the instance's own ledger and
 * nothing else — no wallet, so no claim about linkage — and it has to survive its endpoints being
 * admin-only, since a non-admin can hold a portal grant and reach this page.
 */
const { fetchFreeTier, fetchFleetStats, fetchUsers, openLinkModal } =
  vi.hoisted(() => ({
    fetchFreeTier: vi.fn(),
    fetchFleetStats: vi.fn(),
    fetchUsers: vi.fn(),
    openLinkModal: vi.fn(),
  }));

vi.mock("@portal/api/link", () => ({ fetchFreeTier }));
vi.mock("@portal/api/fleetStats", () => ({ fetchFleetStats }));
vi.mock("@app/portal/usersBackend", () => ({ usersBackend: { fetchUsers } }));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal }),
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

const renderView = (licenseSection?: ReactNode) =>
  render(
    <PortalTestProviders>
      <MemoryRouter>
        <FreeTierPlanView licenseSection={licenseSection} />
      </MemoryRouter>
    </PortalTestProviders>,
  );

describe("FreeTierPlanView", () => {
  beforeEach(() => {
    fetchFreeTier.mockReset();
    fetchFleetStats.mockReset().mockRejectedValue(new Error("no stats"));
    fetchUsers.mockReset().mockRejectedValue(new Error("not admin"));
    openLinkModal.mockReset();
  });

  it.each(["ready", "failed"])(
    "retains license management at the end of the shared card when the ledger is %s",
    async (state) => {
      if (state === "ready") fetchFreeTier.mockResolvedValue(BALANCE);
      else
        fetchFreeTier.mockRejectedValue(
          new HttpError(500, "Server Error", null),
        );
      renderView(<button>Manage local license</button>);
      await screen.findByText(
        state === "ready" ? "120 of 500 used" : "Couldn't load credit usage",
      );
      const section = screen
        .getByRole("button", { name: "Manage local license" })
        .closest("section");
      expect(section).toHaveAttribute("id", "ub-license");
      expect(section?.parentElement?.lastElementChild).toBe(section);
    },
  );

  it("meters the local ledger on the shared screen", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    renderView();

    expect(await screen.findByText("120 of 500 used")).toBeInTheDocument();
    // No rate is known locally, so the row quotes the allowance rather than a price.
    expect(screen.getByText("500 free every month")).toBeInTheDocument();
  });

  it("reads only the instance's own ledger for the meter", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    renderView();

    await screen.findByText("120 of 500 used");
    expect(fetchFreeTier).toHaveBeenCalledTimes(1);
  });

  it("shows the users this server may have when the admin endpoint answers", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    fetchUsers.mockResolvedValue({ summary: { seatsUsed: 3, seatLimit: 5 } });
    renderView();

    expect(await screen.findByText("3 of 5 users")).toBeInTheDocument();
  });

  it("drops the users row rather than claiming zero when it does not", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    renderView();

    await screen.findByText("120 of 500 used");
    expect(screen.queryByText(/of 0 users/)).toBeNull();
    expect(screen.queryByText("Users")).toBeNull();
  });

  it("offers the account as more allowance, and asks for it only on request", async () => {
    fetchFreeTier.mockResolvedValue(BALANCE);
    renderView();

    await screen.findByText("120 of 500 used");
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
