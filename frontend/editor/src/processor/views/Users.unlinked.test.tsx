import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProcessorViewProviders } from "@processor/test/TestQueryProvider";

/**
 * An unlinked instance has its own user limit, so inviting is a free-tier feature and nothing here
 * asks for an account. Running out of seats is the invite endpoint's answer, not a pre-emption.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@processor/hooks/useConnectGate", () => ({
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

vi.mock("@processor/contexts/TierContext", () => ({
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
vi.mock("@processor/auth/saasSupabase", () => ({
  ensureSaasSupabase: vi.fn(),
}));

vi.mock("@processor/views/usersData", () => ({
  useUsersData: () => ({
    usersState: { data: null, loading: false, error: null },
    grantsState: { data: [], loading: false, error: null },
    teamsState: { data: [], loading: false, error: null },
    authState: { data: null, loading: false, error: null },
    refresh: vi.fn(),
  }),
}));

import { Users } from "@processor/views/Users";

const INVITE_MODAL = "users.invite.title";

const renderAt = (initial: string) =>
  render(
    <ProcessorViewProviders>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/processor/users" element={<Users />} />
        </Routes>
      </MemoryRouter>
    </ProcessorViewProviders>,
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
