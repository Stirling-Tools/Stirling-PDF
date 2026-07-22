import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { allowConsole } from "@app/tests/failOnConsole";

// Controllable auth state for the mocked provider. `portalAccess` is the collapsed
// context value (raw user.portalAccess ?? isAdminRole(role)); `user.portalAccess`
// is the raw tri-state (undefined until /api/v1/auth/me resolves).
const authState: {
  session: unknown;
  loading: boolean;
  isAnonymous: boolean;
  portalAccess: boolean;
  user: { portalAccess?: boolean } | null;
} = {
  session: null,
  loading: false,
  isAnonymous: false,
  portalAccess: false,
  user: null,
};

vi.mock("@app/auth", () => ({
  // Passthrough — we drive gating via the mocked useAuth below.
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/auth/context", () => ({ useAuth: () => authState }));
vi.mock("@app/ui", () => ({ Spinner: () => null }));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

import { PortalAuthBoundary } from "@portal/auth/PortalAuthBoundary";

function renderBoundary() {
  render(
    <PortalAuthBoundary>
      <div data-testid="portal">PORTAL</div>
    </PortalAuthBoundary>,
  );
}

describe("PortalAuthBoundary — SaaS", () => {
  beforeEach(() => {
    authState.session = null;
    authState.loading = false;
    authState.isAnonymous = false;
    authState.portalAccess = false;
    authState.user = null;
  });

  it("renders the portal for a real session WITH portal access", () => {
    authState.session = { user: { id: "u1" }, access_token: "tok" };
    authState.portalAccess = true;
    authState.user = { portalAccess: true };
    renderBoundary();
    expect(screen.getByTestId("portal")).toBeInTheDocument();
  });

  it("renders the portal for an admin (collapsed access true before /me resolves)", () => {
    authState.session = { user: { id: "admin" }, access_token: "tok" };
    authState.portalAccess = true; // isAdminRole fallback
    authState.user = {}; // raw portalAccess still undefined
    renderBoundary();
    expect(screen.getByTestId("portal")).toBeInTheDocument();
  });

  it("gates a real session WITHOUT portal access (member) and bounces to the editor", () => {
    authState.session = { user: { id: "member" }, access_token: "tok" };
    authState.portalAccess = false;
    authState.user = { portalAccess: false };
    allowConsole.error(/not implemented|navigation/i);
    renderBoundary();
    expect(screen.queryByTestId("portal")).not.toBeInTheDocument();
  });

  it("waits (no portal, no redirect) while portal access is still resolving", () => {
    authState.session = { user: { id: "u1" }, access_token: "tok" };
    authState.portalAccess = false;
    authState.user = {}; // /me not back yet -> raw portalAccess undefined
    // Deliberately do NOT allow a navigation error: if the gate wrongly bounced
    // this still-resolving user, jsdom's navigation warning would fail the test.
    renderBoundary();
    expect(screen.queryByTestId("portal")).not.toBeInTheDocument();
  });

  it("gates (does not render the portal) for an anonymous guest session", () => {
    authState.session = { user: { id: "guest" }, access_token: "tok" };
    authState.isAnonymous = true;
    allowConsole.error(/not implemented|navigation/i);
    renderBoundary();
    expect(screen.queryByTestId("portal")).not.toBeInTheDocument();
  });

  it("gates (does not render the portal) when there is no session", () => {
    authState.session = null;
    allowConsole.error(/not implemented|navigation/i);
    renderBoundary();
    expect(screen.queryByTestId("portal")).not.toBeInTheDocument();
  });

  it("gates while the session is still resolving", () => {
    authState.loading = true;
    renderBoundary();
    expect(screen.queryByTestId("portal")).not.toBeInTheDocument();
  });
});
