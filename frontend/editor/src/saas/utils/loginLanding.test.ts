import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Team } from "@app/contexts/SaaSTeamContext";
import {
  LOGIN_LANDING_PENDING_KEY,
  consumeLoginLandingPending,
  hasLoginLandingPending,
  isPortalAvailable,
  leadsRealTeam,
  loginLandingMode,
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

describe("leadsRealTeam", () => {
  it("is true when the user leads a non-personal team", () => {
    expect(leadsRealTeam([team({ isLeader: true, isPersonal: false })])).toBe(
      true,
    );
  });

  it("is false for a member of a real team", () => {
    expect(leadsRealTeam([team({ isLeader: false, isPersonal: false })])).toBe(
      false,
    );
  });

  it("is false for a leader of only a personal team (solo user)", () => {
    expect(leadsRealTeam([team({ isLeader: true, isPersonal: true })])).toBe(
      false,
    );
  });

  it("is false with no teams", () => {
    expect(leadsRealTeam([])).toBe(false);
  });

  it("is true when at least one of several teams is a real led team", () => {
    expect(
      leadsRealTeam([
        team({ isLeader: true, isPersonal: true }),
        team({ isLeader: false, isPersonal: false }),
        team({ isLeader: true, isPersonal: false }),
      ]),
    ).toBe(true);
  });
});

describe("login-landing pending flag", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("marks, peeks, and consumes once", () => {
    expect(hasLoginLandingPending()).toBe(false);
    markLoginLandingPending();
    expect(window.sessionStorage.getItem(LOGIN_LANDING_PENDING_KEY)).toBe("1");
    expect(hasLoginLandingPending()).toBe(true);
    // Peek doesn't clear.
    expect(hasLoginLandingPending()).toBe(true);
    // First consume returns true and clears.
    expect(consumeLoginLandingPending()).toBe(true);
    expect(hasLoginLandingPending()).toBe(false);
    // Second consume returns false.
    expect(consumeLoginLandingPending()).toBe(false);
  });
});

describe("isPortalAvailable", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true when VITE_INCLUDE_PORTAL is set", () => {
    vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
    expect(isPortalAvailable()).toBe(true);
  });
});

describe("loginLandingMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to dynamic when unset", () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "");
    expect(loginLandingMode()).toBe("dynamic");
  });

  it("is editor only when explicitly set to 'editor'", () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    expect(loginLandingMode()).toBe("editor");
  });

  it("falls back to dynamic for any other value", () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "processor");
    expect(loginLandingMode()).toBe("dynamic");
  });
});
