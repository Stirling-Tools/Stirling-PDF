import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import type { ConnectOutcome } from "@portal/components/account-link/ConnectCallbackView";

/** A live session token rides in the fragment: strip it at once, refuse what cannot be verified. */
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

/** Stands in for the dialog that consumes the outcome. */
let published: ConnectOutcome[] = [];

function OutcomeSpy() {
  const { connectOutcome } = useUI();
  if (
    connectOutcome &&
    published[published.length - 1]?.state !== connectOutcome.state
  ) {
    published.push(connectOutcome);
  }
  return null;
}

const lastOutcome = () => published[published.length - 1];

/** Route and host together: apart, this would test the hand-off rather than the flow. */
function renderFlow() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/account-link/callback"]}>
        <UIProvider>
          <ConnectCallbackHost />
          <OutcomeSpy />
          <Routes>
            <Route
              path="/account-link/callback"
              element={<ConnectCallback />}
            />
            <Route path="/processor" element={<div data-testid="portal" />} />
          </Routes>
        </UIProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("account-link callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    published = [];
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

    // Before any await: the fragment must not reach the address bar or a history entry.
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

    // Independent outcomes: a failed sign-in must not strand the server unlinked.
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
    await waitFor(() => expect(lastOutcome()?.state).toBe("malformed"));
    expect(lastOutcome()?.reclaim).toBeUndefined();
  });

  it("hands the result to the dialog rather than rendering its own", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);

    const { container } = renderFlow();

    await waitFor(() => expect(lastOutcome()?.state).toBe("linked"));
    expect(lastOutcome()?.sessionRestored).toBe(true);
    expect(container.querySelector(".portal-connect-callback")).toBeNull();
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

    renderFlow();

    await waitFor(() => expect(completeConnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(lastOutcome()?.state).toBe("retry"));

    act(() => lastOutcome()!.reclaim!());

    // Re-claims rather than opening a new handshake, which would spend a leader's approval.
    await waitFor(() => expect(completeConnect).toHaveBeenCalledTimes(2));
    expect(startConnect).not.toHaveBeenCalled();
  });

  it("gives a spent handshake no re-claim, so the dialog asks for a new one", async () => {
    landOn(`#type=link&nonce=${NONCE}`);
    completeConnect.mockResolvedValue({
      phase: "EXPIRED",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: null,
    });

    renderFlow();

    await waitFor(() => expect(lastOutcome()?.state).toBe("expired"));
    expect(lastOutcome()?.reclaim).toBeUndefined();
  });
});
