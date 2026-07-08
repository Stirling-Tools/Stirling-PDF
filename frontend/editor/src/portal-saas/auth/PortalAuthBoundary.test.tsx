import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { allowConsole } from "@app/tests/failOnConsole";

// Controllable auth state for the mocked provider.
const authState: { session: unknown; loading: boolean } = {
  session: null,
  loading: false,
};

vi.mock("@app/auth", () => ({
  // Passthrough — we drive gating via the mocked useAuth below.
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/auth/context", () => ({ useAuth: () => authState }));
vi.mock("@app/ui", () => ({ Spinner: () => null }));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

import { PortalAuthBoundary } from "@portal/auth/PortalAuthBoundary";

describe("PortalAuthBoundary — SaaS", () => {
  beforeEach(() => {
    authState.session = null;
    authState.loading = false;
  });

  it("renders the portal when a Supabase session is present (no login)", () => {
    authState.session = { user: { id: "u1" }, access_token: "tok" };
    render(
      <PortalAuthBoundary>
        <div data-testid="portal">PORTAL</div>
      </PortalAuthBoundary>,
    );
    expect(screen.getByTestId("portal")).toBeInTheDocument();
  });

  it("gates (does not render the portal) when there is no session", () => {
    authState.session = null;
    // The gate bounces to /login; jsdom doesn't implement navigation, so absorb
    // that incidental warning rather than fail the console guard.
    allowConsole.error(/not implemented|navigation/i);
    render(
      <PortalAuthBoundary>
        <div data-testid="portal">PORTAL</div>
      </PortalAuthBoundary>,
    );
    expect(screen.queryByTestId("portal")).not.toBeInTheDocument();
  });

  it("gates while the session is still resolving", () => {
    authState.loading = true;
    render(
      <PortalAuthBoundary>
        <div data-testid="portal">PORTAL</div>
      </PortalAuthBoundary>,
    );
    expect(screen.queryByTestId("portal")).not.toBeInTheDocument();
  });
});
