import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));

import {
  fetchRootDestination,
  loginLandingMode,
} from "@app/utils/loginLanding";

function httpError(status: number) {
  return { isAxiosError: true, message: "http", response: { status } };
}

function mockMe(user: Record<string, unknown>) {
  return { data: { user } };
}

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

describe("fetchRootDestination", () => {
  beforeEach(() => h.get.mockReset());

  it("sends an opted-in user to the processor", async () => {
    h.get.mockResolvedValueOnce(
      mockMe({ portalAccess: true, loginLandingView: "processor" }),
    );
    expect(await fetchRootDestination()).toBe("processor");
  });

  it("sends an admin with no opt-in to the editor", async () => {
    h.get.mockResolvedValueOnce(
      mockMe({ role: "ROLE_ADMIN", portalAccess: true }),
    );
    expect(await fetchRootDestination()).toBe("editor");
  });

  it("sends an opted-in user with no portal access to the editor", async () => {
    h.get.mockResolvedValueOnce(
      mockMe({ portalAccess: false, loginLandingView: "processor" }),
    );
    expect(await fetchRootDestination()).toBe("editor");
  });

  it("decides on one request, without the team list", async () => {
    h.get.mockResolvedValueOnce(
      mockMe({ portalAccess: true, loginLandingView: "processor" }),
    );
    await fetchRootDestination();
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith("/api/v1/auth/me", expect.anything());
  });

  it("signedOut when /me fails", async () => {
    h.get.mockRejectedValueOnce(httpError(401));
    expect(await fetchRootDestination()).toBe("signedOut");
  });
});
