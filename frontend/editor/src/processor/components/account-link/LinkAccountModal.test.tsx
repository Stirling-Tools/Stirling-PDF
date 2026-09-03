import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";

/** The step machine: what drives each step, and what must not skip or repeat one. */
const { startConnect, startReauth, fetchWallet, EMAIL } = vi.hoisted(() => ({
  startConnect: vi.fn(),
  startReauth: vi.fn(),
  fetchWallet: vi.fn(),
  EMAIL: "admin@acme.example",
}));

vi.mock("@processor/api/link", () => ({ startConnect, startReauth }));
vi.mock("@processor/api/billing", () => ({ fetchWallet }));
vi.mock("@processor/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
  // Step 3 reads the connected account's email off this session.
  ensureSaasSupabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { email: EMAIL } } } }),
    },
  }),
}));

import { LinkAccountModal } from "@processor/components/account-link/LinkAccountModal";
import type { ConnectOutcome } from "@processor/components/account-link/ConnectCallbackView";
import { freeWallet } from "@processor/components/billing/walletFixtures";

const AUTHORIZE = "http://localhost:5174/link?request=req-1";

const BENEFITS = "Pipelines, policies, sources and audit";
const GHOST = /Taking you to stirling\.com/;
const CONNECT = /Connect Stirling account/;

function renderModal(
  mode?: "link" | "reauth",
  outcome: ConnectOutcome | null = null,
) {
  return render(
    <ProcessorTestProviders>
      <MemoryRouter>
        <LinkAccountModal
          open
          onClose={() => {}}
          mode={mode}
          outcome={outcome}
        />
      </MemoryRouter>
    </ProcessorTestProviders>,
  );
}

function click(label: string | RegExp) {
  act(() => screen.getByRole("button", { name: label }).click());
}

/** Read off the body because the dialog processors out; the badge itself is uninterpolated here. */
function filledSteps(): number {
  return document.body.querySelectorAll(
    ".processor-stepmodal__progress .is-filled",
  ).length;
}

describe("LinkAccountModal", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchWallet.mockResolvedValue(freeWallet);
    startConnect.mockResolvedValue({
      phase: "PENDING",
      authorizeUrl: AUTHORIZE,
      secondsRemaining: 900,
      teamId: null,
    });
    startReauth.mockResolvedValue({
      phase: "PENDING",
      authorizeUrl: AUTHORIZE,
      secondsRemaining: 900,
      teamId: null,
    });
    assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "http://localhost:5173",
        hostname: "localhost",
        href: "http://localhost:5173/app",
        search: "",
        assign,
      },
    });
  });

  it("opens on the pitch, and asks nothing of the backend until told", () => {
    renderModal();

    expect(screen.getByText(BENEFITS)).toBeTruthy();
    expect(screen.getByRole("button", { name: CONNECT })).toBeTruthy();
    expect(filledSteps()).toBe(1);
    expect(startConnect).not.toHaveBeenCalled();
  });

  it("offers no sign-in form, because a sign-in started here cannot complete", () => {
    const { container } = renderModal();
    click(CONNECT);

    // A sign-in started on this origin cannot complete, so nothing here may collect credentials.
    expect(container.querySelector("input[type=password]")).toBeNull();
    expect(container.querySelector("input[type=email]")).toBeNull();
  });

  it("hands over on the first click, showing the ghost while it goes", async () => {
    renderModal();
    click(CONNECT);

    await waitFor(() => expect(startConnect).toHaveBeenCalled());
    expect(screen.getByText(GHOST)).toBeTruthy();
    expect(filledSteps()).toBe(2);
    // The backend checks this against the request's Origin header.
    expect(startConnect).toHaveBeenCalledWith(
      "localhost",
      "http://localhost:5173/account-link/callback",
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE));
    expect(startReauth).not.toHaveBeenCalled();
  });

  it("uses the reauth endpoint, with no pitch and no steps", async () => {
    renderModal("reauth");

    // A server that is already connected is not sold anything.
    expect(screen.queryByText(BENEFITS)).toBeNull();
    expect(screen.queryByText(/Step 1 of 3/)).toBeNull();

    click(/Sign in again/);

    // A different endpoint: reauth presents the credential, so the team is pinned server-side.
    await waitFor(() =>
      expect(startReauth).toHaveBeenCalledWith(
        "http://localhost:5173/account-link/callback",
      ),
    );
    expect(startConnect).not.toHaveBeenCalled();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE));
  });

  it("falls back to step 1 with the reason when the handshake cannot start", async () => {
    startConnect.mockRejectedValue(new Error("offline"));

    renderModal();
    click(CONNECT);

    await waitFor(() => expect(startConnect).toHaveBeenCalled());
    expect(assign).not.toHaveBeenCalled();
    // The ghost unmounts when the request settles, so the reason lands on step 1.
    expect(await screen.findByText(/outbound network access/)).toBeTruthy();
    expect(screen.getByText(BENEFITS)).toBeTruthy();
    expect(filledSteps()).toBe(1);
  });

  it("does not navigate when there is nothing to navigate to", async () => {
    // Already linked: the backend reports status without an authorize URL.
    startConnect.mockResolvedValue({
      phase: "LINKED",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: 7,
    });

    renderModal();
    click(CONNECT);

    await waitFor(() => expect(startConnect).toHaveBeenCalled());
    expect(assign).not.toHaveBeenCalled();
  });

  /** Busy is never cleared on success, because the page was meant to be gone. */
  describe("coming back from a hand-off that never completed", () => {
    it("clears the in-flight flag when the page is shown again", async () => {
      renderModal();
      click(CONNECT);

      await waitFor(() => expect(screen.getByText(GHOST)).toBeTruthy());

      act(() => {
        window.dispatchEvent(new Event("pageshow"));
      });

      expect(screen.getByText(BENEFITS)).toBeTruthy();
      expect(filledSteps()).toBe(1);
    });

    /**
     * Not the close path itself (the host unmounts, so a fresh mount is clean by construction) but
     * the property behind it: hoist the flag into UIContext and the trap returns, failing here.
     */
    it("keeps the in-flight flag local, so a fresh mount cannot inherit one", async () => {
      const first = renderModal();
      click(CONNECT);
      await waitFor(() => expect(screen.getByText(GHOST)).toBeTruthy());

      first.unmount();
      renderModal();

      expect(screen.getByText(BENEFITS)).toBeTruthy();
      expect(screen.queryByText(GHOST)).toBeNull();
    });
  });

  describe("resuming after the round trip", () => {
    it("lands on step 3 rather than restarting the pitch", async () => {
      renderModal("link", { state: "linked", sessionRestored: true });

      expect(
        await screen.findByText(/now runs against your Stirling account/),
      ).toBeTruthy();
      expect(screen.queryByText(BENEFITS)).toBeNull();
      // Left on 2 of 3, arrived on 3: the whole reason the bar spans the redirect.
      expect(filledSteps()).toBe(3);
      expect(await screen.findByText(EMAIL)).toBeTruthy();
      expect(await screen.findByText("Invite your team")).toBeTruthy();
    });

    it("opens a fresh handshake for a spent one, showing the ghost again", async () => {
      renderModal("link", { state: "expired", sessionRestored: false });

      expect(await screen.findByText("Request expired")).toBeTruthy();
      click(/Try again/);

      await waitFor(() => expect(startConnect).toHaveBeenCalled());
      // Busy outranks the stale outcome, or they sit on "Request expired" until the browser goes.
      expect(screen.getByText(GHOST)).toBeTruthy();
    });

    it("offers no retry while the claim is still in flight", async () => {
      renderModal("link", { state: "working", sessionRestored: false });

      expect(await screen.findByText(/Finishing the connection/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    });

    it("does not offer a retry for a response it could not read", async () => {
      renderModal("link", { state: "malformed", sessionRestored: false });

      expect(
        await screen.findByText(/Could not read the response/),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    });
  });
});
