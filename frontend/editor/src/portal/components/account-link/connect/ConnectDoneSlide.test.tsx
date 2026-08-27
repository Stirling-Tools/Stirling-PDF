import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The free-grant figure is the one number on this screen a customer can check against their
 * account, so it must be the wallet's and never a hardcoded 500: the allowance is seeded per team,
 * so an account that has already spent it has nothing left to show.
 *
 * The upgrade CTA is the other thing worth pinning. It appears on a nearly spent trial and not
 * otherwise, because a prompt to pay on a screen confirming a free connection is the wrong note
 * unless it is actually the next thing to do.
 */
const { fetchWallet } = vi.hoisted(() => ({ fetchWallet: vi.fn() }));
vi.mock("@portal/api/billing", () => ({ fetchWallet }));

import { ConnectDoneSlide } from "@portal/components/account-link/connect/ConnectDoneSlide";
import { freeWallet } from "@portal/components/billing/walletFixtures";

/** The shared free-plan wallet, wound down to the balance under test. */
const wallet = (freeRemaining: number) => ({
  ...freeWallet,
  freeRemaining,
  billableUsed: freeWallet.freeAllowance - freeRemaining,
});

const SWITCH_ON = /Switch on the Processor/;

const renderDone = () =>
  render(
    <PortalTestProviders>
      <MemoryRouter>
        <ConnectDoneSlide onNavigate={() => {}} />
      </MemoryRouter>
    </PortalTestProviders>,
  );

describe("ConnectDoneSlide", () => {
  it("shows the wallet's remaining balance, not a fixed grant", async () => {
    fetchWallet.mockResolvedValue(wallet(128));
    renderDone();
    await waitFor(() => expect(screen.getByText("128")).toBeTruthy());
  });

  it("shows a spent grant as zero rather than hiding it", async () => {
    fetchWallet.mockResolvedValue(wallet(0));
    renderDone();
    await waitFor(() => expect(screen.getByText("0")).toBeTruthy());
  });

  it("omits the meter entirely when the wallet cannot be read", async () => {
    fetchWallet.mockRejectedValue(new Error("not linked"));
    renderDone();
    await waitFor(() =>
      expect(screen.getByText("Invite your team")).toBeTruthy(),
    );
    // No meter and no upgrade prompt off a balance we never learned.
    expect(document.querySelector(".paygf-meter")).toBeNull();
    expect(screen.queryByText(SWITCH_ON)).toBeNull();
  });

  it("asks the admin to switch the Processor on once the trial is nearly gone", async () => {
    fetchWallet.mockResolvedValue(wallet(40));
    renderDone();
    await waitFor(() => expect(screen.getByText(SWITCH_ON)).toBeTruthy());
    // First, above the things that can wait.
    const rows = [...document.querySelectorAll(".portal-connect__next-item")];
    expect(rows[0]?.textContent).toMatch(SWITCH_ON);
  });

  it("leaves the upgrade unmentioned while there is trial left to use", async () => {
    fetchWallet.mockResolvedValue(wallet(500));
    renderDone();
    await waitFor(() =>
      expect(document.querySelector(".paygf-meter")).toBeTruthy(),
    );
    expect(screen.queryByText(SWITCH_ON)).toBeNull();
  });

  it("always offers the next steps", async () => {
    fetchWallet.mockResolvedValue(wallet(500));
    renderDone();
    await waitFor(() =>
      expect(screen.getByText("Invite your team")).toBeTruthy(),
    );
    expect(screen.getByText("Set up a pipeline")).toBeTruthy();
    expect(screen.getByText("Add a policy")).toBeTruthy();
  });
});
