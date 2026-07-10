import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { Team } from "@app/contexts/SaaSTeamContext";

// Mutable holders driven per-test; read at call time by the mocks below.
const h = vi.hoisted(() => ({
  auth: { session: null as unknown, isAnonymous: false },
  prefs: { loginLandingView: "processor" as "processor" | "editor" },
  role: null as string | null,
  teams: [] as Team[],
  get: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => h.auth }));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: h.prefs, updatePreference: vi.fn() }),
}));

import { SaasLoginLandingRedirect } from "@app/components/SaasLoginLandingRedirect";
import {
  hasLoginLandingPending,
  markLoginLandingPending,
} from "@app/utils/loginLanding";

function team(overrides: Partial<Team>): Team {
  return {
    teamId: 1,
    name: "Team",
    teamType: "STANDARD",
    isPersonal: false,
    memberCount: 1,
    seatCount: 1,
    seatsUsed: 1,
    maxSeats: 1,
    isLeader: false,
    ...overrides,
  } as Team;
}

function LocationProbe() {
  return <div data-testid="pathname">{useLocation().pathname}</div>;
}

function renderAt(pathname = "/") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SaasLoginLandingRedirect />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const SIGNED_IN = { session: { user: { id: "u1" } }, isAnonymous: false };

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
  vi.stubEnv("VITE_LOGIN_LANDING_MODE", "dynamic");
  h.auth = { ...SIGNED_IN };
  h.prefs = { loginLandingView: "processor" };
  h.role = null;
  h.teams = [];
  h.get.mockReset();
  h.get.mockImplementation((url: string) => {
    if (url === "/api/v1/auth/me") {
      return Promise.resolve({ data: { user: { role: h.role } } });
    }
    if (url === "/api/v1/team/my") {
      return Promise.resolve({ data: h.teams });
    }
    return Promise.resolve({ data: {} });
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("SaasLoginLandingRedirect", () => {
  it("sends a real team lead to the processor and consumes the flag", async () => {
    h.teams = [team({ isLeader: true, isPersonal: false })];
    markLoginLandingPending();

    renderAt("/");

    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe("/processor"),
    );
    expect(hasLoginLandingPending()).toBe(false);
  });

  it("sends an admin to the processor even without a real team", async () => {
    h.role = "ROLE_ADMIN";
    h.teams = [team({ isLeader: true, isPersonal: true })];
    markLoginLandingPending();

    renderAt("/");

    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe("/processor"),
    );
  });

  it("keeps a member on the editor", async () => {
    h.teams = [team({ isLeader: false, isPersonal: false })];
    markLoginLandingPending();

    renderAt("/");

    // Flag is consumed only once the lookup resolves.
    await waitFor(() => expect(hasLoginLandingPending()).toBe(false));
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("keeps a solo (personal-team) non-admin on the editor", async () => {
    h.teams = [team({ isLeader: true, isPersonal: true })];
    markLoginLandingPending();

    renderAt("/");

    await waitFor(() => expect(hasLoginLandingPending()).toBe(false));
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("still redirects a team lead under StrictMode double-invoke", async () => {
    h.teams = [team({ isLeader: true, isPersonal: false })];
    markLoginLandingPending();

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <SaasLoginLandingRedirect />
          <LocationProbe />
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("pathname").textContent).toBe("/processor"),
    );
    expect(hasLoginLandingPending()).toBe(false);
  });

  it("does not fetch or redirect when a processor user opted into the editor", async () => {
    h.prefs = { loginLandingView: "editor" };
    h.role = "ROLE_ADMIN";
    markLoginLandingPending();

    renderAt("/");

    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
    // The one-shot flag is still consumed so it can't fire on a later visit.
    expect(hasLoginLandingPending()).toBe(false);
  });

  it("does nothing in editor mode (soft release), even for an admin", async () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    h.role = "ROLE_ADMIN";
    markLoginLandingPending();

    renderAt("/");

    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("does nothing without the fresh-login flag", async () => {
    h.teams = [team({ isLeader: true, isPersonal: false })];

    renderAt("/");

    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("waits on auth routes and does not consume the flag there", async () => {
    h.teams = [team({ isLeader: true, isPersonal: false })];
    markLoginLandingPending();

    renderAt("/login");

    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(hasLoginLandingPending()).toBe(true);
  });

  it("ignores anonymous sessions", async () => {
    h.auth = { session: { user: { id: "anon" } }, isAnonymous: true };
    h.role = "ROLE_ADMIN";
    markLoginLandingPending();

    renderAt("/");

    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });
});
