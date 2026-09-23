import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@app/portal/api/http";
import type { ReactNode } from "react";
import { PortalRosterHost } from "@app/portal/components/settings/PortalRosterHost";
import { PortalSettingsSectionHost } from "@app/portal/components/settings/PortalSettingsSectionHost";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { UIProvider, useUI } from "@app/portal/contexts/UIContext";
import type { ConnectOutcome } from "@app/portal/components/account-link/ConnectCallbackView";
import { rememberConnect } from "@app/portal/auth/pendingConnect";
import { AuthApiError } from "@supabase/supabase-js";

/** A live session token rides in the fragment: strip it at once, refuse what cannot be verified. */
const { completeConnect, startConnect, setSession, refresh, client } =
  vi.hoisted(() => {
    const setSession = vi.fn();
    return {
      completeConnect: vi.fn(),
      startConnect: vi.fn(),
      setSession,
      client: { auth: { setSession } },
      refresh: vi.fn(),
    };
  });

vi.mock("@app/portal/api/link", () => ({ completeConnect, startConnect }));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: () => client,
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => client,
  clearSupabaseSession: vi.fn(),
}));
vi.mock("@app/portal/contexts/AccountLinkContext", () => ({
  AccountLinkProvider: ({ children }: { children: ReactNode }) => children,
  useAccountLinkContext: () => ({ refresh }),
}));

const ownership = vi.hoisted(() => ({ orgOwner: true }));
vi.mock("@app/auth", () => ({
  useAuth: () => ({
    user: { id: "owner", orgOwner: ownership.orgOwner },
    isAdmin: true,
    loading: false,
  }),
}));
vi.mock("@app/portal/auth/accountLinkSession", () => ({
  bindAccountLinkSession: vi.fn(),
  clearAccountLinkSession: vi.fn(),
}));
vi.mock("@app/portal/components/account-link/AccountConnectionNotice", () => ({
  AccountConnectionRefresh: () => null,
  AccountConnectionNotice: () => null,
}));
vi.mock("@app/portal/components/account-link/SaasSessionBanner", () => ({
  SaasSessionBanner: () => null,
}));
vi.mock("@app/portal/components/account-link/LinkAccountModal", () => ({
  LinkAccountModalHost: () => null,
}));

import ConnectCallback from "@app/portal/views/ConnectCallback";
import { ConnectCallbackHost } from "@app/portal/components/account-link/ConnectCallbackHost";

const NONCE = "the-nonce";

function landOn(fragment: string) {
  window.history.replaceState(
    null,
    "",
    `/account-link/callback?state=browser-state${fragment}`,
  );
}

/** Stands in for the dialog that consumes the outcome. */
let published: ConnectOutcome[] = [];
let modalMode = "";
let routeState: unknown;

function OutcomeSpy() {
  const { connectOutcome, linkModalMode } = useUI();
  modalMode = linkModalMode;
  routeState = useLocation().state;
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
            <Route
              path="/processor/usage"
              element={<div data-testid="usage" />}
            />
          </Routes>
        </UIProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("account-link callback", () => {
  beforeEach(() => {
    ownership.orgOwner = true;
    vi.clearAllMocks();
    published = [];
    sessionStorage.clear();
    localStorage.setItem("stirling.portalSaasOwner", "owner");
    rememberConnect({
      ownerId: "owner",
      mode: "link",
      returnTo: "/processor",
      browserState: "browser-state",
    });
    completeConnect.mockResolvedValue({
      phase: "LINKED",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: 7,
    });
    setSession.mockResolvedValue({ error: null });
  });

  it.each(["/settings/billing", "/settings/account-link", "/settings/users"])(
    "restores renewal through the settings host at %s",
    async (returnTo) => {
      const Host =
        returnTo === "/settings/users"
          ? PortalRosterHost
          : PortalSettingsSectionHost;
      rememberConnect({
        ownerId: "owner",
        mode: "reauth",
        returnTo,
        browserState: "browser-state",
      });
      landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
      const screen = render(
        <MantineProvider>
          <MemoryRouter initialEntries={["/account-link/callback"]}>
            <Routes>
              <Route
                path="/account-link/callback"
                element={<ConnectCallback />}
              />
              <Route
                path={returnTo}
                element={
                  <Host>
                    <OutcomeSpy />
                    <div data-testid="settings-destination" />
                  </Host>
                }
              />
            </Routes>
          </MemoryRouter>
        </MantineProvider>,
      );
      await waitFor(() => expect(lastOutcome()?.state).toBe("linked"));
      expect(screen.getByTestId("settings-destination")).toBeTruthy();
      expect(modalMode).toBe("reauth");
      expect(setSession).toHaveBeenCalledWith({
        access_token: "at",
        refresh_token: "rt",
      });
      expect(routeState).toBeNull();
    },
  );

  it("discards a former owner's callback without installing a session or showing a modal", async () => {
    ownership.orgOwner = false;
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
    renderFlow();
    await waitFor(() => expect(routeState).toBeNull());
    expect(window.location.hash).toBe("");
    expect(completeConnect).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });

  it("removes the token-bearing fragment from the URL", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);

    renderFlow();

    // Before any await: the fragment must not reach the address bar or a history entry.
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(completeConnect).toHaveBeenCalled());
  });

  it("rejects an approval started by a different local owner", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
    localStorage.setItem("stirling.portalSaasOwner", "different-owner");
    renderFlow();
    await waitFor(() => expect(lastOutcome()?.state).toBe("malformed"));
    expect(completeConnect).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("discards a callback when the dialog is dismissed during confirmation", async () => {
    let resolve!: (value: unknown) => void;
    completeConnect.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
    renderFlow();
    await waitFor(() => expect(lastOutcome()?.state).toBe("working"));
    act(() => lastOutcome()?.cancel?.());
    await act(async () => {
      resolve({ phase: "LINKED" });
    });
    expect(setSession).not.toHaveBeenCalled();
    expect(lastOutcome()?.state).toBe("working");
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

  it("waits for server acceptance before installing the browser session", async () => {
    let accept!: (value: { phase: string }) => void;
    completeConnect.mockReturnValueOnce(
      new Promise((resolve) => {
        accept = resolve;
      }),
    );
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);

    renderFlow();

    await waitFor(() => expect(lastOutcome()?.state).toBe("working"));
    expect(completeConnect).toHaveBeenCalledWith(NONCE);
    expect(setSession).not.toHaveBeenCalled();
    await act(async () => accept({ phase: "LINKED" }));
    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({
        access_token: "at",
        refresh_token: "rt",
      }),
    );
    await waitFor(() => expect(completeConnect).toHaveBeenCalledWith(NONCE));
    expect(completeConnect.mock.invocationCallOrder[0]).toBeLessThan(
      setSession.mock.invocationCallOrder[0],
    );
    expect(routeState).toBeNull();
  });

  it("links without a session when the fragment carries no tokens", async () => {
    landOn(`#type=link&nonce=${NONCE}`);

    renderFlow();

    await waitFor(() => expect(lastOutcome()?.state).toBe("linked"));
    expect(completeConnect).toHaveBeenCalledWith(NONCE);
    expect(lastOutcome()?.sessionRestored).toBe(false);
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

    await act(async () => {
      await lastOutcome()!.reclaim!();
    });

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

  it.each([403, 409])(
    "does not retry a link rejected after ownership changes (%s)",
    async (status) => {
      landOn(`#type=link&nonce=${NONCE}`);
      completeConnect.mockRejectedValue(new HttpError(status, "Rejected", {}));
      renderFlow();
      await waitFor(() => expect(lastOutcome()?.state).toBe("rejected"));
      expect(lastOutcome()?.reclaim).toBeUndefined();
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it.each(["REJECTED", "EXPIRED", "PENDING", "UNAVAILABLE"])(
    "does not install tokens for a %s handshake",
    async (phase) => {
      landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
      completeConnect.mockResolvedValue({ phase });
      renderFlow();
      const outcome =
        phase === "REJECTED"
          ? "rejected"
          : phase === "EXPIRED"
            ? "expired"
            : "retry";
      await waitFor(() => expect(lastOutcome()?.state).toBe(outcome));
      expect(setSession).not.toHaveBeenCalled();
    },
  );

  it("rejects a callback from another browser or a cancelled flow", async () => {
    sessionStorage.clear();
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
    renderFlow();
    await waitFor(() => expect(lastOutcome()?.state).toBe("malformed"));
    expect(setSession).not.toHaveBeenCalled();
    expect(completeConnect).not.toHaveBeenCalled();
  });

  it("preserves renewal mode and destination across the full callback", async () => {
    rememberConnect({
      mode: "reauth",
      ownerId: "owner",
      returnTo: "/processor/usage",
      browserState: "browser-state",
    });
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
    const screen = renderFlow();
    await waitFor(() => expect(lastOutcome()?.state).toBe("linked"));
    expect(modalMode).toBe("reauth");
    expect(screen.getByTestId("usage")).toBeTruthy();
  });

  it("retries a failed session installation without consuming the handshake again", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`);
    setSession
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ error: null });
    renderFlow();
    await waitFor(() => expect(lastOutcome()?.state).toBe("retry"));
    await act(async () => {
      await lastOutcome()!.reclaim!();
    });
    await waitFor(() => expect(lastOutcome()?.sessionRestored).toBe(true));
    expect(completeConnect).toHaveBeenCalledTimes(1);
    expect(setSession).toHaveBeenCalledTimes(2);
  });

  it("offers a fresh sign-in when callback credentials are permanently rejected", async () => {
    landOn(`#type=link&nonce=${NONCE}&access_token=at&refresh_token=revoked`);
    setSession.mockResolvedValue({
      error: new AuthApiError("revoked", 400, "refresh_token_not_found"),
    });
    renderFlow();
    await waitFor(() => expect(setSession).toHaveBeenCalledOnce());
    await waitFor(() => expect(lastOutcome()?.state).toBe("rejected"));
    expect(completeConnect).toHaveBeenCalledOnce();
    expect(lastOutcome()?.sessionRestored).toBe(false);
    expect(lastOutcome()?.reclaim).toBeUndefined();
  });

  it("refuses a callback with a mismatched tab correlator", async () => {
    window.history.replaceState(
      null,
      "",
      `/account-link/callback?state=wrong#type=link&nonce=${NONCE}&access_token=at&refresh_token=rt`,
    );
    renderFlow();
    await waitFor(() => expect(lastOutcome()?.state).toBe("malformed"));
    expect(completeConnect).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });
});
