import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The connect flow's step machine.
 *
 * What matters: the pitch is never skipped for a fresh link, the hand-off happens on step 2 and
 * only when the admin asks for it, re-auth never grows a pitch or a success screen it has no
 * business showing, and an outcome published by the callback resumes on step 3 rather than opening
 * a second dialog.
 */
const { startConnect, startReauth, fetchWallet, EMAIL } = vi.hoisted(() => ({
  startConnect: vi.fn(),
  startReauth: vi.fn(),
  fetchWallet: vi.fn(),
  EMAIL: "admin@acme.example",
}));

vi.mock("@portal/api/link", () => ({ startConnect, startReauth }));
vi.mock("@portal/api/billing", () => ({ fetchWallet }));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
  // Step 3 reads the connected account's email off this session.
  ensureSaasSupabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { email: EMAIL } } } }),
    },
  }),
}));

import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import type { ConnectOutcome } from "@portal/components/account-link/ConnectCallbackView";
import { freeWallet } from "@portal/components/billing/walletFixtures";

const AUTHORIZE = "http://localhost:5174/link?request=req-1";

const BENEFITS = "Pipelines, policies, sources and audit";
const GHOST = /Taking you to stirling\.com/;
const CONNECT = /Connect Stirling account/;

function renderModal(
  mode?: "link" | "reauth",
  outcome: ConnectOutcome | null = null,
) {
  return render(
    <PortalTestProviders>
      <MemoryRouter>
        <LinkAccountModal
          open
          onClose={() => {}}
          mode={mode}
          outcome={outcome}
        />
      </MemoryRouter>
    </PortalTestProviders>,
  );
}

function click(label: string | RegExp) {
  act(() => screen.getByRole("button", { name: label }).click());
}

/**
 * How far along the progress bar reads, which is the step indicator that survives no-i18n.
 * Queried off the body because the dialog portals out of the render container.
 */
function filledSteps(): number {
  return document.body.querySelectorAll(
    ".portal-stepmodal__progress .is-filled",
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

    // Nothing collects credentials on this origin: the admin signs in on Stirling, so a provider
    // button here would send them there and abandon them.
    expect(container.querySelector("input[type=password]")).toBeNull();
    expect(container.querySelector("input[type=email]")).toBeNull();
  });

  it("hands over on the first click, showing the ghost while it goes", async () => {
    renderModal();
    click(CONNECT);

    // One click, not two: step 2 is the hand-off happening, not a page about it.
    await waitFor(() => expect(startConnect).toHaveBeenCalled());
    expect(screen.getByText(GHOST)).toBeTruthy();
    expect(filledSteps()).toBe(2);
    // Callback built from this page's own origin, which the backend then checks
    // against the request's Origin header.
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

    // A different endpoint on purpose: reauth presents the device credential so
    // Stirling pins the handshake to the team that already owns this server.
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
    // The ghost is not where an error belongs: it unmounts the moment the request settles, so
    // the reason has to land on the step the admin is returned to.
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

  /**
   * The hand-off is flagged in flight and never cleared on the success path, because the page was
   * supposed to be gone. Both ways of coming back have to undo that, or the dialog is stuck on the
   * ghost step with nothing to click.
   */
  describe("coming back from a hand-off that never completed", () => {
    it("clears the in-flight flag when the page is shown again", async () => {
      renderModal();
      click(CONNECT);

      await waitFor(() => expect(screen.getByText(GHOST)).toBeTruthy());

      // Back from Stirling, restored from the browser's cache with the heap intact.
      act(() => {
        window.dispatchEvent(new Event("pageshow"));
      });

      expect(screen.getByText(BENEFITS)).toBeTruthy();
      expect(filledSteps()).toBe(1);
    });

    /**
     * Not a test of the close path itself: the host mounts this dialog only while open, so closing
     * is an unmount and a fresh mount is clean by construction. What this pins is the property that
     * makes that work, and the mistake that would undo it. Hoist the in-flight flag into UIContext
     * (the obvious "fix" if the ghost ever needs to survive something) and the trap comes straight
     * back, with this failing.
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
      // The whole reason the progress bar spans the redirect: the admin left on 2 of 3 and the
      // bar says they arrived on 3. Counted rather than read off the badge, because the step
      // label is interpolated and i18n is not initialised here.
      expect(filledSteps()).toBe(3);
      // Which account, so the admin can see it landed on the one they meant rather than
      // whatever they were last signed in as.
      expect(await screen.findByText(EMAIL)).toBeTruthy();
      // And the moment to act on what was unlocked.
      expect(await screen.findByText("Invite your team")).toBeTruthy();
    });

    it("opens a fresh handshake for a spent one, showing the ghost again", async () => {
      renderModal("link", { state: "expired", sessionRestored: false });

      expect(await screen.findByText("Request expired")).toBeTruthy();
      click(/Try again/);

      await waitFor(() => expect(startConnect).toHaveBeenCalled());
      // Busy outranks the stale outcome, or the admin would sit on "Request expired"
      // until the browser left.
      expect(screen.getByText(GHOST)).toBeTruthy();
    });

    it("offers no retry while the claim is still in flight", async () => {
      renderModal("link", { state: "working", sessionRestored: false });

      expect(await screen.findByText(/Finishing the connection/)).toBeTruthy();
      // Retrying over a call that has not answered is how you get two handshakes.
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
