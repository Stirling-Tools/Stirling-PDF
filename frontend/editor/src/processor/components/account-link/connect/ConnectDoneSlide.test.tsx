import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";

/**
 * The figure is checkable against a real account, so it must be the wallet's and never a hardcoded
 * 500. The upgrade row appears only on a nearly spent trial: a prompt to pay is the wrong note on a
 * screen confirming a free connection.
 */
const { fetchWallet } = vi.hoisted(() => ({ fetchWallet: vi.fn() }));
vi.mock("@processor/api/billing", () => ({ fetchWallet }));

import { ConnectDoneSlide } from "@processor/components/account-link/connect/ConnectDoneSlide";
import { freeWallet } from "@processor/components/billing/walletFixtures";

/** The shared fixture, wound down to the balance under test. */
const wallet = (freeRemaining: number) => ({
  ...freeWallet,
  freeRemaining,
  billableUsed: freeWallet.freeAllowance - freeRemaining,
});

const SWITCH_ON = /Switch on the Processor/;

const renderDone = () =>
  render(
    <ProcessorTestProviders>
      <MemoryRouter>
        <ConnectDoneSlide onNavigate={() => {}} />
      </MemoryRouter>
    </ProcessorTestProviders>,
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
    expect(document.querySelector(".paygf-meter")).toBeNull();
    expect(screen.queryByText(SWITCH_ON)).toBeNull();
  });

  it("asks the admin to switch the Processor on once the trial is nearly gone", async () => {
    fetchWallet.mockResolvedValue(wallet(40));
    renderDone();
    await waitFor(() => expect(screen.getByText(SWITCH_ON)).toBeTruthy());
    const rows = [
      ...document.querySelectorAll(".processor-connect__next-item"),
    ];
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
