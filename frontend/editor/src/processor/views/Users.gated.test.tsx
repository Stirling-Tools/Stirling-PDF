import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProcessorViewProviders } from "@processor/test/TestQueryProvider";

/**
 * `?invite` opens the modal from an effect, so guarding openInvite did nothing for it. Same hole as
 * Sources' `?new=1`, and it survived that fix.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
const gate = { gated: true };

vi.mock("@processor/hooks/useConnectGate", () => ({
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

vi.mock("@processor/hooks/useUsersData", () => ({
  useUsersData: () => ({
    usersState: { data: [], loading: false, error: null },
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
