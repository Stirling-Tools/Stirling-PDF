import { beforeEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { configureSpringAuth } from "@app/auth/config";
import { defaultPlatformBridge } from "@app/auth/spring/platformBridge";
import * as desktopBridge from "@app/extensions/platformSessionBridge";
import { springAuth } from "@app/auth/spring/springAuthClient";
import { SpringAuthProvider } from "@app/auth/spring/UseSession";
import { useAuth } from "@app/auth/context";
import { authService } from "@app/services/authService";

const state = vi.hoisted(() => ({ mode: "selfhosted" }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCurrentMode: async () => state.mode },
}));
vi.mock("@app/services/authService", () => ({
  authService: {
    getUserInfo: vi.fn(),
    saveToken: vi.fn(),
    refreshSupabaseToken: vi.fn(),
  },
}));
const http = axios.create();
const get = vi.spyOn(http, "get");
const post = vi.spyOn(http, "post");
const token =
  btoa(JSON.stringify({ alg: "HS256" })) +
  "." +
  btoa(
    JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: 4102444800 }),
  ) +
  ".test";
const serverUser = {
  id: "42",
  username: "ConnorYoh",
  email: "owner@example.com",
  role: "ROLE_ADMIN",
  orgOwner: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  state.mode = "selfhosted";
  localStorage.clear();
  localStorage.setItem("stirling_jwt", token);
  configureSpringAuth({
    http,
    platform: { ...defaultPlatformBridge, ...desktopBridge },
  });
  vi.mocked(authService.getUserInfo).mockResolvedValue({
    username: "cached-name",
  });
  vi.mocked(authService.saveToken).mockResolvedValue(undefined);
});

it.each([true, false])(
  "loads server role and ownership into the desktop auth context: owner=%s",
  async (orgOwner) => {
    get.mockResolvedValue({ data: { user: { ...serverUser, orgOwner } } });
    const { result } = renderHook(() => useAuth(), {
      wrapper: SpringAuthProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer " + token },
      }),
    );
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.user?.orgOwner).toBe(orgOwner);
    expect(result.current.user?.username).toBe("ConnorYoh");
    expect(authService.getUserInfo).not.toHaveBeenCalled();
  },
);

it("does not use a cached identity when the server rejects the session", async () => {
  const denied = new AxiosError(
    "Unauthorized",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 401,
      statusText: "Unauthorized",
      data: {},
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    },
  );
  get.mockRejectedValue(denied);
  post.mockRejectedValue(denied);
  const { result } = renderHook(() => useAuth(), {
    wrapper: SpringAuthProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.user).toBeNull();
  expect(result.current.isAdmin).toBe(false);
  expect(authService.getUserInfo).not.toHaveBeenCalled();
});

it("keeps SaaS on its platform session path", async () => {
  state.mode = "saas";
  const { result } = renderHook(() => useAuth(), {
    wrapper: SpringAuthProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.user?.username).toBe("cached-name");
  expect(result.current.user?.role).toBe("USER");
  expect(result.current.user?.orgOwner).toBeUndefined();
  expect(get).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

it("persists a refreshed self-hosted token and the server's updated ownership", async () => {
  post.mockResolvedValue({
    data: {
      user: { ...serverUser, orgOwner: false },
      session: { access_token: token, expires_in: 3600 },
    },
  });
  const response = await springAuth.refreshSession();
  expect(response.error).toBeNull();
  expect(response.data.session?.user.orgOwner).toBe(false);
  expect(post).toHaveBeenCalledWith(
    "/api/v1/auth/refresh",
    null,
    expect.any(Object),
  );
  expect(authService.saveToken).toHaveBeenCalledWith(token);
  expect(authService.refreshSupabaseToken).not.toHaveBeenCalled();
});
