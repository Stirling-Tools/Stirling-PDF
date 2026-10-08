import { beforeEach, expect, it, vi } from "vitest";
import { AuthService } from "@app/services/authService";
import { AxiosError } from "axios";

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  getConfig: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
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
vi.mock("@app/services/tauriHttpClient", () => ({
  default: { post: state.post },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_URL: "https://cloud.example.org",
  SUPABASE_KEY: "public-key",
  DESKTOP_DEEP_LINK_CALLBACK: "stirlingpdf://auth",
}));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: { ...actual.default, get: state.get, post: state.post },
  };
});

function token(expiresIn: number) {
  return `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresIn }))}.signature`;
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  state.getConfig.mockResolvedValue({
    mode: "saas",
    require_sign_in: true,
    saas_only: true,
  });
  state.invoke.mockResolvedValue(token(3600));
  state.get.mockResolvedValue({ data: { id: "user-id", is_anonymous: false } });
});

it.each(["saas", "selfhosted"])(
  "retains verified %s access after refresh even if account validation goes offline",
  async (mode) => {
    const serverUrl =
      mode === "saas"
        ? "https://cloud.example.org"
        : "https://self.example.org";
    state.getConfig.mockResolvedValue({
      mode,
      server_config: { url: serverUrl },
    });
    state.get.mockResolvedValue({ data: { id: "user-id", username: "user" } });
    const service = new AuthService();
    expect(await service.hasManagedSession()).toBe(true);
    const refreshed = token(7200);
    state.post.mockResolvedValue({ data: { access_token: refreshed } });
    state.get.mockRejectedValue(new AxiosError("Offline", "ERR_NETWORK"));
    expect(
      await (mode === "saas"
        ? service.refreshSupabaseToken(serverUrl)
        : service.refreshToken(serverUrl)),
    ).toBe(true);
    expect(await service.hasManagedSession()).toBe(true);
    expect(state.get).toHaveBeenCalledTimes(1);
  },
);

it("does not extend verification to a refresh from another server", async () => {
  const service = new AuthService();
  expect(await service.hasManagedSession()).toBe(true);
  state.post.mockResolvedValue({ data: { access_token: token(7200) } });
  await service.refreshToken("https://other.example.org");
  state.get.mockRejectedValue(new AxiosError("Offline", "ERR_NETWORK"));
  expect(await service.hasManagedSession()).toBe(false);
});

it("revalidates when the connection mode changes even at the same URL", async () => {
  const service = new AuthService();
  expect(await service.hasManagedSession()).toBe(true);
  state.getConfig.mockResolvedValue({
    mode: "selfhosted",
    server_config: { url: "https://cloud.example.org" },
  });
  state.get.mockRejectedValue(new AxiosError("Offline", "ERR_NETWORK"));
  expect(await service.hasManagedSession()).toBe(false);
});

it.each([undefined, 408, 429, 503])(
  "retains an unexpired verified session after a transient refresh failure (%s)",
  async (status) => {
    const service = new AuthService();
    expect(await service.hasManagedSession()).toBe(true);
    state.post.mockRejectedValue(
      Object.assign(new AxiosError("Temporarily unavailable"), {
        response: status ? { status } : undefined,
      }),
    );
    expect(
      await service.refreshSupabaseToken("https://cloud.example.org"),
    ).toBe(false);
    expect(await service.hasManagedSession()).toBe(true);
    expect(state.invoke).not.toHaveBeenCalledWith("clear_auth_token");
  },
);

it("revokes an expired session even when refresh is rate limited", async () => {
  state.invoke.mockResolvedValue(token(-60));
  const service = new AuthService();
  state.post.mockRejectedValue(
    Object.assign(new AxiosError("Rate limited"), {
      response: { status: 429 },
    }),
  );
  expect(await service.hasManagedSession()).toBe(false);
  expect(state.invoke).toHaveBeenCalledWith("clear_auth_token");
});

it("does not refresh or revoke a verified token before its actual expiry", async () => {
  state.invoke.mockResolvedValue(token(20));
  const service = new AuthService();
  const refresh = vi.spyOn(service, "refreshSupabaseToken");
  expect(await service.hasManagedSession()).toBe(true);
  state.get.mockRejectedValue(new AxiosError("Offline", "ERR_NETWORK"));
  expect(await service.hasManagedSession()).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
});

it("revokes verification after an explicit refresh rejection", async () => {
  const service = new AuthService();
  expect(await service.hasManagedSession()).toBe(true);
  state.post.mockRejectedValue(
    Object.assign(new AxiosError("Unauthorized"), {
      response: { status: 401 },
    }),
  );
  await service.refreshSupabaseToken("https://cloud.example.org");
  expect(state.invoke).toHaveBeenCalledWith("clear_auth_token");
  state.get.mockRejectedValue(new AxiosError("Offline", "ERR_NETWORK"));
  expect(await service.hasManagedSession()).toBe(false);
});

it("does not admit an unverified session during a network failure", async () => {
  state.get.mockRejectedValue(new AxiosError("Offline", "ERR_NETWORK"));
  expect(await new AuthService().hasManagedSession()).toBe(false);
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
