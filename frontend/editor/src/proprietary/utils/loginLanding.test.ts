import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));

import {
  fetchRootDestination,
  isPortalAvailable,
  leadsRealTeam,
  loginLandingMode,
  type LandingTeam,
} from "@app/utils/loginLanding";

function team(o: Partial<LandingTeam>): LandingTeam {
  return { isLeader: false, isPersonal: false, ...o };
}

// Axios-error-shaped plain object (not an Error instance) so the harness's
// uncaught-Error tracking doesn't flag the rejection that fetchRootDestination
// deliberately catches.
function httpError(status: number) {
  return { isAxiosError: true, message: "http", response: { status } };
}

function mockMe(role: string | null, portalAccess: boolean) {
  return { data: { user: { role, portalAccess } } };
}

describe("leadsRealTeam", () => {
  it("is true only for a non-personal led team", () => {
    expect(leadsRealTeam([team({ isLeader: true, isPersonal: false })])).toBe(
      true,
    );
    expect(leadsRealTeam([team({ isLeader: false, isPersonal: false })])).toBe(
      false,
    );
    expect(leadsRealTeam([team({ isLeader: true, isPersonal: true })])).toBe(
      false,
    );
    expect(leadsRealTeam([])).toBe(false);
  });
});

describe("loginLandingMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to dynamic unless explicitly 'editor'", () => {
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "");
    expect(loginLandingMode()).toBe("dynamic");
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "editor");
    expect(loginLandingMode()).toBe("editor");
    vi.stubEnv("VITE_LOGIN_LANDING_MODE", "whatever");
    expect(loginLandingMode()).toBe("dynamic");
  });
});

describe("isPortalAvailable", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true when VITE_INCLUDE_PORTAL is set", () => {
    vi.stubEnv("VITE_INCLUDE_PORTAL", "true");
    expect(isPortalAvailable()).toBe(true);
  });
});

describe("fetchRootDestination", () => {
  beforeEach(() => h.get.mockReset());

  // fetchRootDestination calls /me first, then /team/my. mockRejectedValueOnce
  // is vitest's rejection helper (tracks the rejection so it isn't flagged).
  it("self-hosted (no /team/my): uses portalAccess = true", async () => {
    h.get
      .mockResolvedValueOnce(mockMe("USER", true))
      .mockRejectedValueOnce(httpError(404));
    expect(await fetchRootDestination()).toBe("processor");
  });

  it("self-hosted (no /team/my): portalAccess false → editor", async () => {
    h.get
      .mockResolvedValueOnce(mockMe("USER", false))
      .mockRejectedValueOnce(httpError(404));
    expect(await fetchRootDestination()).toBe("editor");
  });

  it("saas: admin → processor even with only a personal team", async () => {
    h.get.mockImplementation((url: string) => {
      if (url === "/api/v1/auth/me")
        return Promise.resolve(mockMe("ROLE_ADMIN", true));
      return Promise.resolve({
        data: [team({ isLeader: true, isPersonal: true })],
      });
    });
    expect(await fetchRootDestination()).toBe("processor");
  });

  it("saas: non-admin real lead → processor", async () => {
    h.get.mockImplementation((url: string) => {
      if (url === "/api/v1/auth/me")
        return Promise.resolve(mockMe("USER", true));
      return Promise.resolve({
        data: [team({ isLeader: true, isPersonal: false })],
      });
    });
    expect(await fetchRootDestination()).toBe("processor");
  });

  it("saas: member → editor (ignores polluted portalAccess)", async () => {
    h.get.mockImplementation((url: string) => {
      if (url === "/api/v1/auth/me")
        return Promise.resolve(mockMe("USER", true));
      return Promise.resolve({
        data: [
          team({ isLeader: true, isPersonal: true }),
          team({ isLeader: false, isPersonal: false }),
        ],
      });
    });
    expect(await fetchRootDestination()).toBe("editor");
  });

  it("signedOut when /me fails - not authenticated", async () => {
    h.get.mockRejectedValueOnce(httpError(401));
    expect(await fetchRootDestination()).toBe("signedOut");
  });

  it("editor when /team/my fails with a non-404 (ambiguous)", async () => {
    h.get
      .mockResolvedValueOnce(mockMe("USER", true))
      .mockRejectedValueOnce(httpError(500));
    expect(await fetchRootDestination()).toBe("editor");
  });
});
