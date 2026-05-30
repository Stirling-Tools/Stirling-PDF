import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@app/auth/supabase";

// Mock supabase
vi.mock("@app/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
    },
  },
}));

describe("apiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules to get fresh instance of apiClient
    vi.resetModules();
  });

  it("should add JWT token to request headers when session exists", async () => {
    const mockToken = "test-jwt-token-12345";
    const mockSession = {
      access_token: mockToken,
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "user-123" },
    } as unknown as Session;

    // Mock getSession to return a session with token
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    // Import apiClient after mocking
    const { default: apiClient } = await import("@app/services/apiClient");

    // Create a mock adapter to intercept the request
    const mockAdapter = vi.fn((config) => {
      // Verify the Authorization header is set correctly
      expect(config.headers.Authorization).toBe(`Bearer ${mockToken}`);
      return Promise.resolve({
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    });

    // Replace the adapter
    apiClient.defaults.adapter = mockAdapter;

    // Make a test request
    await apiClient.get("/api/v1/test");

    // Verify the request was made with the token
    expect(mockAdapter).toHaveBeenCalled();
    expect(supabase.auth.getSession).toHaveBeenCalled();
  });

  it("should handle requests when no session exists", async () => {
    // Mock getSession to return no session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    // Import apiClient after mocking
    const { default: apiClient } = await import("@app/services/apiClient");

    // Create a mock adapter to intercept the request
    const mockAdapter = vi.fn((config) => {
      // Verify no Authorization header is set
      expect(config.headers.Authorization).toBeUndefined();
      return Promise.resolve({
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    });

    // Replace the adapter
    apiClient.defaults.adapter = mockAdapter;

    // Make a test request
    await apiClient.get("/api/v1/test");

    // Verify the request was made without a token
    expect(mockAdapter).toHaveBeenCalled();
    expect(supabase.auth.getSession).toHaveBeenCalled();
  });

  it("should refresh token on 401 response", async () => {
    const oldToken = "old-token";
    const newToken = "new-refreshed-token";

    const oldSession = {
      access_token: oldToken,
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "user-123" },
    } as unknown as Session;

    const newSession = {
      access_token: newToken,
      refresh_token: "new-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "user-123" },
    } as unknown as Session;

    // Mock initial session for first request
    let getSessionCallCount = 0;
    vi.mocked(supabase.auth.getSession).mockImplementation(async () => {
      getSessionCallCount++;
      // First call returns old session, subsequent calls return new session
      if (getSessionCallCount === 1) {
        return { data: { session: oldSession }, error: null };
      }
      return { data: { session: newSession }, error: null };
    });

    // Mock refresh to return new session
    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: { user: null, session: newSession },
      error: null,
    });

    // Import apiClient after mocking
    const { default: apiClient } = await import("@app/services/apiClient");

    let requestCount = 0;
    const mockAdapter = vi.fn((config) => {
      requestCount++;

      // First request returns 401
      if (requestCount === 1) {
        // Verify first request has old token
        expect(config.headers.Authorization).toBe(`Bearer ${oldToken}`);
        const error = Object.assign(new Error("Unauthorized"), {
          response: { status: 401, data: { error: "Unauthorized" } },
          config,
        });
        return Promise.reject(error);
      }

      // Second request (after refresh) should have new token
      // The interceptor will call getSession again, which now returns the new session
      expect(config.headers.Authorization).toBe(`Bearer ${newToken}`);
      return Promise.resolve({
        data: { success: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    });

    // Replace the adapter
    apiClient.defaults.adapter = mockAdapter;

    // Make a test request that will trigger 401 and retry
    const response = await apiClient.get("/api/v1/test");

    // Verify the token was refreshed and request retried
    expect(response.data).toEqual({ success: true });
    expect(supabase.auth.refreshSession).toHaveBeenCalled();
    expect(mockAdapter).toHaveBeenCalledTimes(2);
    expect(getSessionCallCount).toBe(3); // Called for initial request, for checking if refresh is possible, and for retry
  });

  it("should handle refresh token failure", async () => {
    const oldToken = "old-token";

    const oldSession = {
      access_token: oldToken,
      user: { id: "user-123" },
    };

    // Mock initial session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: oldSession as unknown as Session },
      error: null,
    });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: oldSession as unknown as Session },
      error: null,
    });

    // Mock refresh to fail
    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        name: "AuthError",
        message: "Refresh failed",
        status: 400,
        code: "auth_error",
      } as unknown as AuthError,
    });

    // Import apiClient after mocking
    const { default: apiClient } = await import("@app/services/apiClient");

    // Mock window.location for redirect test
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });

    const mockAdapter = vi.fn((config) => {
      // Always return 401 to trigger refresh
      const error = Object.assign(new Error("Unauthorized"), {
        response: { status: 401, data: { error: "Unauthorized" } },
        config,
      });
      return Promise.reject(error);
    });

    // Replace the adapter
    apiClient.defaults.adapter = mockAdapter;

    // Make a test request that will trigger 401
    try {
      await apiClient.get("/api/v1/test");
      // Should not reach here
      expect(true).toBe(false);
    } catch (_) {
      // Verify refresh was attempted
      expect(supabase.auth.refreshSession).toHaveBeenCalled();
      // Verify redirect to login
      expect(window.location.href).toBe("/login");
    }
  });
});
