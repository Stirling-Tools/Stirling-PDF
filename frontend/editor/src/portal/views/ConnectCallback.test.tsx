import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";

/**
 * The callback page handles a live session token in a URL fragment, so the behaviour worth pinning is what it does with it: strip it immediately, refuse anything it cannot verify, and keep the two outcomes (SaaS sign-in, server link) independent of each other.
 */
const { completeConnect, startConnect, setSession } = vi.hoisted(() => ({
  completeConnect: vi.fn(),
  startConnect: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@portal/api/link", () => ({ completeConnect, startConnect }));
vi.mock("@portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: () => ({ auth: { setSession } }),
}));

import ConnectCallback from "@portal/views/ConnectCallback";

const NONCE = "the-nonce";

function landOn(fragment: string) {
  window.history.replaceState(null, "", `/account-link/callback${fragment}`);
}

function renderPage() {
  // MantineProvider because @app/ui/Button is a Mantine button underneath.
  return render(
    <MantineProvider>
      <MemoryRouter>
        <ConnectCallback />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("ConnectCallback", () => {
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

    renderPage();

    // Synchronous, before any await: the fragment must not survive long enough
    // to be read from the address bar or land in a history entry.
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(completeConnect).toHaveBeenCalled());
  });

  it("deposits the session and then finishes the link with the nonce", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);

    renderPage();

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

    renderPage();

    // The two outcomes are independent: a failed sign-in must not strand the
    // server unlinked.
    await waitFor(() => expect(completeConnect).toHaveBeenCalledWith(NONCE));
  });

  it("links without a session when the fragment carries no tokens", async () => {
    landOn(`#type=link&nonce=${NONCE}`);

    renderPage();

    await waitFor(() => expect(completeConnect).toHaveBeenCalledWith(NONCE));
    expect(setSession).not.toHaveBeenCalled();
  });

  it("refuses a fragment with no nonce", async () => {
    landOn("#type=link&access_token=at&refresh_token=rt");

    renderPage();

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(completeConnect).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("refuses a fragment that is not a link response", async () => {
    landOn(`#type=something-else&nonce=${NONCE}&access_token=at`);

    renderPage();

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(completeConnect).not.toHaveBeenCalled();
  });

  it("refuses a bare page load", async () => {
    landOn("");

    renderPage();

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

    const { getByRole } = renderPage();

    await waitFor(() => expect(completeConnect).toHaveBeenCalledTimes(1));
    act(() => getByRole("button").click());

    // Retries the existing handshake; starting a new one would waste the
    // approval a human just gave.
    await waitFor(() => expect(completeConnect).toHaveBeenCalledTimes(2));
    expect(startConnect).not.toHaveBeenCalled();
  });
});
