import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortalViewProviders } from "@portal/test/TestQueryProvider";

/**
 * The deep link into the invite flow, which the gate has to cover in its own right.
 *
 * `?invite` opens the modal from an effect rather than through the click handler, so guarding
 * openInvite did nothing for it. Same hole as Sources' `?new=1`, and it survived that fix — the
 * super search and the connect flow's own next steps both arrive here this way.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
const gate = { gated: true };

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({
    gated: gate.gated,
    loading: false,
    available: true,
    connect,
    guard:
      <A extends unknown[]>(action: (...args: A) => void) =>
      (...args: A) => {
        if (gate.gated) connect();
        else action(...args);
      },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// The page's chrome, none of which this test is about.
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

vi.mock("@portal/hooks/useUsersData", () => ({
  useUsersData: () => ({
    usersState: { data: [], loading: false, error: null },
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

describe("Users deep link when the account is not connected", () => {
  beforeEach(() => {
    connect.mockReset();
    gate.gated = true;
  });

  it("asks to connect instead of opening the invite modal", () => {
    renderAt("/processor/users?invite");
    expect(connect).toHaveBeenCalled();
    expect(screen.queryByText(INVITE_MODAL)).toBeNull();
  });

  it("leaves the page alone when there is no deep link", () => {
    renderAt("/processor/users");
    expect(connect).not.toHaveBeenCalled();
  });

  it("still honours the deep link once connected", () => {
    gate.gated = false;
    renderAt("/processor/users?invite");
    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByText(INVITE_MODAL)).toBeInTheDocument();
  });
});
