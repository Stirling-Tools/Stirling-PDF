import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

/**
 * The modal every "link account" CTA in the portal opens. What matters is that it
 * starts the right handshake and hands the browser to Stirling, and that the
 * callback URL it advertises is its own origin rather than anything a caller
 * supplied.
 */
const { startConnect, startReauth } = vi.hoisted(() => ({
  startConnect: vi.fn(),
  startReauth: vi.fn(),
}));

vi.mock("@portal/api/link", () => ({ startConnect, startReauth }));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));

import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";

const AUTHORIZE = "http://localhost:5174/link?request=req-1";

function renderModal(mode?: "link" | "reauth") {
  return render(
    <MantineProvider>
      <LinkAccountModal open onClose={() => {}} mode={mode} />
    </MantineProvider>,
  );
}

/** Clicks the primary action (the secondary one is Cancel). */
function clickContinue(getAllByRole: (role: string) => HTMLElement[]) {
  const buttons = getAllByRole("button");
  act(() => buttons[buttons.length - 1].click());
}

describe("LinkAccountModal", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
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
        assign,
      },
    });
  });

  it("offers no sign-in form, because a sign-in started here cannot complete", () => {
    const { container } = renderModal();

    // The provider buttons this modal used to carry sent the admin to Stirling and
    // abandoned them there. Nothing should collect credentials on this origin.
    expect(container.querySelector("input[type=password]")).toBeNull();
    expect(container.querySelector("input[type=email]")).toBeNull();
  });

  it("starts a link handshake and hands the browser to Stirling", async () => {
    const { getAllByRole } = renderModal();

    clickContinue(getAllByRole);

    await waitFor(() => expect(startConnect).toHaveBeenCalled());
    // Callback built from this page's own origin, which the backend then checks
    // against the request's Origin header.
    expect(startConnect).toHaveBeenCalledWith(
      "localhost",
      "http://localhost:5173/account-link/callback",
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE));
    expect(startReauth).not.toHaveBeenCalled();
  });

  it("uses the reauth endpoint when only the session needs renewing", async () => {
    const { getAllByRole } = renderModal("reauth");

    clickContinue(getAllByRole);

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

  it("stays put and explains itself when the handshake cannot start", async () => {
    startConnect.mockRejectedValue(new Error("offline"));

    const { getAllByRole } = renderModal();
    clickContinue(getAllByRole);

    await waitFor(() => expect(startConnect).toHaveBeenCalled());
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not navigate when there is nothing to navigate to", async () => {
    // Already linked: the backend reports status without an authorize URL.
    startConnect.mockResolvedValue({
      phase: "LINKED",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: 7,
    });

    const { getAllByRole } = renderModal();
    clickContinue(getAllByRole);

    await waitFor(() => expect(startConnect).toHaveBeenCalled());
    expect(assign).not.toHaveBeenCalled();
  });
});
