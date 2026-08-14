import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The free-grant figure is the one number on this screen a customer can check against their
 * account, so it must be the wallet's and never a hardcoded 500: the allowance is seeded per team
 * at team creation, so an account that has already spent it has nothing left to show.
 */
const { fetchWallet } = vi.hoisted(() => ({ fetchWallet: vi.fn() }));
vi.mock("@portal/api/billing", () => ({ fetchWallet }));

import { ConnectDoneSlide } from "@portal/components/account-link/connect/ConnectDoneSlide";

const renderSlide = () =>
  render(
    <PortalTestProviders>
      <MemoryRouter>
        <ConnectDoneSlide onNavigate={() => {}} />
      </MemoryRouter>
    </PortalTestProviders>,
  );

describe("ConnectDoneSlide", () => {
  it("shows the wallet's remaining balance, not a fixed grant", async () => {
    fetchWallet.mockResolvedValue({ freeRemaining: 128 });
    renderSlide();
    await waitFor(() => expect(screen.getByText("128")).toBeTruthy());
    expect(screen.queryByText("500")).toBeNull();
  });

  it("shows a spent grant as zero rather than hiding it", async () => {
    fetchWallet.mockResolvedValue({ freeRemaining: 0 });
    renderSlide();
    await waitFor(() => expect(screen.getByText("0")).toBeTruthy());
  });

  it("omits the figure when the wallet cannot be read", async () => {
    fetchWallet.mockRejectedValue(new Error("not linked"));
    renderSlide();
    await waitFor(() =>
      expect(screen.getByText("Invite your team")).toBeTruthy(),
    );
    expect(screen.queryByText("free credits remaining")).toBeNull();
  });

  it("always offers the next steps", async () => {
    fetchWallet.mockResolvedValue({ freeRemaining: 500 });
    renderSlide();
    await waitFor(() =>
      expect(screen.getByText("Invite your team")).toBeTruthy(),
    );
    expect(screen.getByText("Set up a pipeline")).toBeTruthy();
    expect(screen.getByText("Add a policy")).toBeTruthy();
  });
});
