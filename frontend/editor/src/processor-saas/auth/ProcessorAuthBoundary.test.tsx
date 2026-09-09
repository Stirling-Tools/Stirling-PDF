import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { allowConsole } from "@app/tests/failOnConsole";

// Controllable auth state for the mocked provider. `processorAccess` is the collapsed
// context value (raw user.processorAccess ?? isAdminRole(role)); `user.processorAccess`
// is the raw tri-state (undefined until /api/v1/auth/me resolves).
const authState: {
  session: unknown;
  loading: boolean;
  isAnonymous: boolean;
  processorAccess: boolean;
  user: { processorAccess?: boolean } | null;
} = {
  session: null,
  loading: false,
  isAnonymous: false,
  processorAccess: false,
  user: null,
};

vi.mock("@app/auth", () => ({
  // Passthrough — we drive gating via the mocked useAuth below.
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/auth/context", () => ({ useAuth: () => authState }));
vi.mock("@app/ui", () => ({ Spinner: () => null }));
vi.mock("@processor/auth/saasSupabase", () => ({
  ensureSaasSupabase: vi.fn(),
}));

import { ProcessorAuthBoundary } from "@processor/auth/ProcessorAuthBoundary";

function renderBoundary() {
  render(
    <ProcessorAuthBoundary>
      <div data-testid="processor">PORTAL</div>
    </ProcessorAuthBoundary>,
  );
}

describe("ProcessorAuthBoundary — SaaS", () => {
  beforeEach(() => {
    authState.session = null;
    authState.loading = false;
    authState.isAnonymous = false;
    authState.processorAccess = false;
    authState.user = null;
  });

  it("renders the processor for a real session WITH processor access", () => {
    authState.session = { user: { id: "u1" }, access_token: "tok" };
    authState.processorAccess = true;
    authState.user = { processorAccess: true };
    renderBoundary();
    expect(screen.getByTestId("processor")).toBeInTheDocument();
  });

  it("renders the processor for an admin (collapsed access true before /me resolves)", () => {
    authState.session = { user: { id: "admin" }, access_token: "tok" };
    authState.processorAccess = true; // isAdminRole fallback
    authState.user = {}; // raw processorAccess still undefined
    renderBoundary();
    expect(screen.getByTestId("processor")).toBeInTheDocument();
  });

  it("gates a real session WITHOUT processor access (member) and bounces to the editor", () => {
    authState.session = { user: { id: "member" }, access_token: "tok" };
    authState.processorAccess = false;
    authState.user = { processorAccess: false };
    allowConsole.error(/not implemented|navigation/i);
    renderBoundary();
    expect(screen.queryByTestId("processor")).not.toBeInTheDocument();
  });

  it("waits (no processor, no redirect) while processor access is still resolving", () => {
    authState.session = { user: { id: "u1" }, access_token: "tok" };
    authState.processorAccess = false;
    authState.user = {}; // /me not back yet -> raw processorAccess undefined
    // Deliberately do NOT allow a navigation error: if the gate wrongly bounced
    // this still-resolving user, jsdom's navigation warning would fail the test.
    renderBoundary();
    expect(screen.queryByTestId("processor")).not.toBeInTheDocument();
  });

  it("gates (does not render the processor) for an anonymous guest session", () => {
    authState.session = { user: { id: "guest" }, access_token: "tok" };
    authState.isAnonymous = true;
    allowConsole.error(/not implemented|navigation/i);
    renderBoundary();
    expect(screen.queryByTestId("processor")).not.toBeInTheDocument();
  });

  it("gates (does not render the processor) when there is no session", () => {
    authState.session = null;
    allowConsole.error(/not implemented|navigation/i);
    renderBoundary();
    expect(screen.queryByTestId("processor")).not.toBeInTheDocument();
  });

  it("gates while the session is still resolving", () => {
    authState.loading = true;
    renderBoundary();
    expect(screen.queryByTestId("processor")).not.toBeInTheDocument();
  });
});
