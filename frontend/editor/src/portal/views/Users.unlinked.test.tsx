import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortalViewProviders } from "@portal/test/TestQueryProvider";

/**
 * An unlinked instance has users of its own — the grandfathered licence limit, five by default — so
 * inviting one is a free-tier feature and neither the button nor the `?invite` deep link asks for a
 * Stirling account. Linking replaces that limit with the linked team's larger allowance; running
 * out of seats is the invite endpoint's own answer, not something to pre-empt here.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({
    gated: true,
    loading: false,
    available: true,
    connect,
    // Faithful to the real hook while gated, so re-guarding any of these actions fails the test
    // rather than passing through it.
    guard:
      <A extends unknown[]>(_action: (...args: A) => void) =>
      () =>
        connect(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("@portal/contexts/TierContext", () => ({
  useTier: () => ({ tier: "pro" }),
}));
vi.mock("@app/auth", () => ({
  getStoredToken: () => null,
  clearStoredToken: vi.fn(),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => null,
  configureSupabase: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

vi.mock("@portal/views/usersData", () => ({
  useUsersData: () => ({
    usersState: { data: null, loading: false, error: null },
    grantsState: { data: [], loading: false, error: null },
    teamsState: { data: [], loading: false, error: null },
    authState: { data: null, loading: false, error: null },
    refresh: vi.fn(),
  }),
}));

import { Users } from "@portal/views/Users";

const INVITE_MODAL = "users.invite.title";

const renderAt = (initial: string) =>
  render(
    <PortalViewProviders>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/processor/users" element={<Users />} />
        </Routes>
      </MemoryRouter>
    </PortalViewProviders>,
  );

describe("Users on an instance with no Stirling account", () => {
  beforeEach(() => connect.mockReset());

  it("honours the invite deep link rather than asking for an account", () => {
    renderAt("/processor/users?invite");
    expect(screen.getByText(INVITE_MODAL)).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });

  it("leaves the page alone when there is no deep link", () => {
    renderAt("/processor/users");
    expect(connect).not.toHaveBeenCalled();
  });
});
