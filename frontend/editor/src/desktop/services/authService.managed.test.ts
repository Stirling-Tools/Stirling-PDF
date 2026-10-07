import { beforeEach, expect, it, vi } from "vitest";
import { AuthService } from "@app/services/authService";

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  getConfig: vi.fn(),
  get: vi.fn(),
  allowSelfHosted: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: state.invoke,
  isTauri: () => true,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig: state.getConfig,
    assertSelfHostedAllowed: state.allowSelfHosted,
  },
}));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {},
}));
vi.mock("@app/services/tauriHttpClient", () => ({ default: {} }));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_URL: "https://cloud.example.org",
  SUPABASE_KEY: "public-key",
  DESKTOP_DEEP_LINK_CALLBACK: "stirlingpdf://auth",
}));
vi.mock("axios", () => ({ default: { get: state.get } }));

function token(expiresIn: number) {
  return `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresIn }))}.signature`;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.getConfig.mockResolvedValue({
    mode: "saas",
    require_sign_in: true,
    saas_only: true,
  });
  state.invoke.mockResolvedValue(token(3600));
  state.get.mockResolvedValue({ data: { id: "user-id", is_anonymous: false } });
});

it("verifies a stored session against Cloud before admitting it", async () => {
  const service = new AuthService();
  expect(await service.hasManagedSession()).toBe(true);
  expect(state.get).toHaveBeenCalledWith(
    "https://cloud.example.org/auth/v1/user",
    expect.objectContaining({
      headers: expect.objectContaining({ apikey: "public-key" }),
    }),
  );
  expect(await service.hasManagedSession()).toBe(true);
  expect(state.get).toHaveBeenCalledTimes(1);
});

it("rejects an old self-hosted token that Cloud does not recognise", async () => {
  state.get.mockRejectedValue(new Error("Unauthorized"));
  expect(await new AuthService().hasManagedSession()).toBe(false);
});

it("rejects anonymous Cloud accounts", async () => {
  state.get.mockResolvedValue({ data: { id: "guest-id", is_anonymous: true } });
  expect(await new AuthService().hasManagedSession()).toBe(false);
});

it("requires successful refresh before admitting an expired token", async () => {
  state.invoke.mockResolvedValue(token(-60));
  const service = new AuthService();
  const refresh = vi
    .spyOn(service, "refreshSupabaseToken")
    .mockResolvedValue(false);
  expect(await service.hasManagedSession()).toBe(false);
  expect(refresh).toHaveBeenCalled();
  expect(state.get).not.toHaveBeenCalled();
});

it("does not validate a prohibited connection mode", async () => {
  state.getConfig.mockResolvedValue({
    mode: "selfhosted",
    saas_only: true,
    server_config: { url: "https://self.example.org" },
  });
  expect(await new AuthService().hasManagedSession()).toBe(false);
  expect(state.get).not.toHaveBeenCalled();
});

it("checks policy before accepting self-hosted SSO tokens", async () => {
  state.allowSelfHosted.mockRejectedValue(new Error("Cloud required"));
  await expect(
    new AuthService().completeSelfHostedSession(
      "https://self.example.org",
      token(3600),
    ),
  ).rejects.toThrow("Cloud required");
  expect(state.get).not.toHaveBeenCalled();
  expect(state.invoke).not.toHaveBeenCalled();
});
