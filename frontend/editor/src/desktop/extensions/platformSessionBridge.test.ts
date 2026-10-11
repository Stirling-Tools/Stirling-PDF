import { beforeEach, expect, it, vi } from "vitest";
import { refreshPlatformSession } from "@app/extensions/platformSessionBridge";

const state = vi.hoisted(() => ({
  mode: vi.fn(),
  refresh: vi.fn(),
  token: vi.fn(),
  expired: vi.fn(),
  verified: vi.fn(),
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: state.mode,
    getServerConfig: async () => ({ url: "https://self.example.org" }),
  },
}));
vi.mock("@app/services/authService", () => ({
  authService: {
    refreshSupabaseToken: state.refresh,
    refreshToken: state.refresh,
    getAuthToken: state.token,
    isTokenExpiringSoon: state.expired,
    hasManagedSession: state.verified,
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.mode.mockResolvedValue("saas");
  state.refresh.mockResolvedValue(false);
  state.token.mockResolvedValue("token");
  state.expired.mockReturnValue(false);
  state.verified.mockResolvedValue(true);
});

it.each(["saas", "selfhosted"])(
  "keeps a verified %s session usable by the auth client after a temporary refresh failure",
  async (mode) => {
    state.mode.mockResolvedValue(mode);
    expect(await refreshPlatformSession()).toBe(true);
    expect(state.expired).toHaveBeenCalledWith("token", 0);
    expect(state.verified).toHaveBeenCalledOnce();
  },
);

it("does not preserve an expired session", async () => {
  state.expired.mockReturnValue(true);
  expect(await refreshPlatformSession()).toBe(false);
  expect(state.verified).not.toHaveBeenCalled();
});

it("does not preserve a session whose credentials were cleared", async () => {
  state.token.mockResolvedValue(null);
  expect(await refreshPlatformSession()).toBe(false);
  expect(state.verified).not.toHaveBeenCalled();
});

it("does not admit an unverified session during an outage", async () => {
  state.verified.mockResolvedValue(false);
  expect(await refreshPlatformSession()).toBe(false);
});

it("accepts successful refreshes without a fallback check", async () => {
  state.refresh.mockResolvedValue(true);
  expect(await refreshPlatformSession()).toBe(true);
  expect(state.verified).not.toHaveBeenCalled();
});
