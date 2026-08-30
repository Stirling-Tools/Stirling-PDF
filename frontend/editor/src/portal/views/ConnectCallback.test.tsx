import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MantineProvider } from "@mantine/core";

/**
 * The callback handles a live session token in a URL fragment, so the behaviour worth pinning is what it does with it: strip it immediately, refuse anything it cannot verify, and keep the two outcomes (SaaS sign-in, server link) independent of each other.
 */
const { completeConnect, startConnect, setSession, refresh } = vi.hoisted(
  () => ({
    completeConnect: vi.fn(),
    startConnect: vi.fn(),
    setSession: vi.fn(),
    refresh: vi.fn(),
  }),
);

vi.mock("@portal/api/link", () => ({ completeConnect, startConnect }));
vi.mock("@portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: () => ({ auth: { setSession } }),
}));
vi.mock("@portal/contexts/AccountLinkContext", () => ({
  useAccountLinkContext: () => ({ refresh }),
}));

import ConnectCallback from "@portal/views/ConnectCallback";
import { ConnectCallbackHost } from "@portal/components/account-link/ConnectCallbackHost";

const NONCE = "the-nonce";

function landOn(fragment: string) {
  window.history.replaceState(null, "", `/account-link/callback${fragment}`);
}

/**
 * Route and host together: the route reads the fragment, the portal renders the
 * outcome. Exercising them apart would test the hand-off rather than the flow.
 */
function renderFlow() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/account-link/callback"]}>
        <ConnectCallbackHost />
        <Routes>
          <Route path="/account-link/callback" element={<ConnectCallback />} />
          <Route path="/processor" element={<div data-testid="portal" />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("account-link callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeConnect.mockResolvedValue({
      phase: "LINKED",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: 7,
    });
    setSession.mockResolvedValue({ error: null });
  });

  it("removes the token-bearing fragment from the URL", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);

    renderFlow();

    // Synchronous, before any await: the fragment must not survive long enough
    // to be read from the address bar or land in a history entry.
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(completeConnect).toHaveBeenCalled());
  });

  it("lands on the portal rather than leaving the result on a bare page", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);

    const { getByTestId } = renderFlow();

    await waitFor(() => expect(getByTestId("portal")).toBeTruthy());
  });

  it("re-reads the link status, so the page behind agrees with the modal", async () => {
    landOn(`#type=link&nonce=${NONCE}`);

    renderFlow();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("deposits the session and then finishes the link with the nonce", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);

    renderFlow();

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({
        access_token: "at",
        refresh_token: "rt",
      }),
    );
    await waitFor(() => expect(completeConnect).toHaveBeenCalledWith(NONCE));
  });

  it("finishes the link even when the session hand-off fails", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
    setSession.mockRejectedValue(new Error("nope"));

    renderFlow();

    // The two outcomes are independent: a failed sign-in must not strand the
    // server unlinked.
    await waitFor(() => expect(completeConnect).toHaveBeenCalledWith(NONCE));
  });

  it("links without a session when the fragment carries no tokens", async () => {
    landOn(`#type=link&nonce=${NONCE}`);

    renderFlow();

    await waitFor(() => expect(completeConnect).toHaveBeenCalledWith(NONCE));
    expect(setSession).not.toHaveBeenCalled();
  });

  it("refuses a fragment with no nonce", async () => {
    landOn("#type=link&access_token=at&refresh_token=rt");

    renderFlow();

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(completeConnect).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("refuses a fragment that is not a link response", async () => {
    landOn(`#type=something-else&nonce=${NONCE}&access_token=at`);

    renderFlow();

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(completeConnect).not.toHaveBeenCalled();
  });

  it("refuses a bare page load", async () => {
    landOn("");

    renderFlow();

    expect(completeConnect).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("offers a retry rather than a restart while the handshake is still open", async () => {
    landOn(`#type=link&nonce=${NONCE}`);
    completeConnect.mockResolvedValue({
      phase: "UNAVAILABLE",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: null,
    });

    const { getAllByRole } = renderFlow();

    await waitFor(() => expect(completeConnect).toHaveBeenCalledTimes(1));
    // Last button, not the only one: the modal shell contributes a close button.
    const buttons = getAllByRole("button");
    act(() => buttons[buttons.length - 1].click());

    // Retries the existing handshake; starting a new one would waste the
    // approval a human just gave.
    await waitFor(() => expect(completeConnect).toHaveBeenCalledTimes(2));
    expect(startConnect).not.toHaveBeenCalled();
  });
});
