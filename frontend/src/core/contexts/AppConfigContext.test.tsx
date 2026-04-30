import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { waitFor, renderHook, act } from "@testing-library/react";
import {
  AppConfigProvider,
  useAppConfig,
} from "@app/contexts/AppConfigContext";
import apiClient from "@app/services/apiClient";
import { ReactNode } from "react";

// Mock apiClient
vi.mock("@app/services/apiClient");

describe("AppConfigContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.pathname
    Object.defineProperty(window, "location", {
      value: { pathname: "/" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppConfigProvider>{children}</AppConfigProvider>
  );

  /**
   * Helper to mock API responses for app-config and info-status
   */
  const mockApiResponses = (config: any, delay = 0) => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (url === "/api/v1/config/app-config") {
        return { status: 200, data: config };
      }
      if (url === "/api/v1/info/status") {
        return { status: 200, data: { status: "UP" } };
      }
      return { status: 404, data: {} };
    });
  };

  it("should fetch and provide app config on non-auth pages", async () => {
    const mockConfig = {
      enableLogin: false,
      appNameNavbar: "Stirling PDF",
      languages: ["en-US", "en-GB"],
    };

    // Use a small delay to ensure we can catch the loading state
    mockApiResponses(mockConfig, 10);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toBeNull();

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
        expect(result.current.config).toEqual(mockConfig);
        expect(result.current.error).toBeNull();
      },
      { timeout: 1000 },
    );

    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/config/app-config", {
      suppressErrorToast: true,
      skipAuthRedirect: true,
    });
  });

  it("should skip fetch on auth pages and use default config", async () => {
    // Mock being on login page
    Object.defineProperty(window, "location", {
      value: { pathname: "/login" },
      writable: true,
    });

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual({ enableLogin: true });
    });

    // Should NOT call API on auth pages
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("should handle 401 error gracefully", async () => {
    const mockError = Object.assign(new Error("Unauthorized"), {
      response: { status: 401, data: {} },
    });
    vi.mocked(apiClient.get).mockRejectedValue(mockError);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual({ enableLogin: true });
      // 401 should be handled gracefully, error may be null or set
    });
  });

  it("should handle network errors", async () => {
    const errorMessage = "Network error occurred";
    const mockError = new Error(errorMessage);
    // Network errors don't have response property
    // Mock rejection for all retry attempts (default is 0 retries in test if not specified,
    // but the component might still catch it)
    vi.mocked(apiClient.get).mockRejectedValue(mockError);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual({ enableLogin: true });
      expect(result.current.error).toBe(errorMessage);
    });
  });

  it("should skip fetch on signup page", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/signup" },
      writable: true,
    });

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual({ enableLogin: true });
    });

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("should skip fetch on auth callback page", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/auth/callback" },
      writable: true,
    });

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual({ enableLogin: true });
    });

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("should skip fetch on invite accept page", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/invite/abc123" },
      writable: true,
    });

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual({ enableLogin: true });
    });

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("should refetch config when jwt-available event is triggered", async () => {
    const initialConfig = {
      enableLogin: true,
      appNameNavbar: "Stirling PDF",
    };

    const updatedConfig = {
      enableLogin: true,
      appNameNavbar: "Stirling PDF",
      isAdmin: true,
      enableAnalytics: true,
    };

    // Setup implementation to return different configs on subsequent calls
    let callCount = 0;
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/api/v1/config/app-config") {
        callCount++;
        return {
          status: 200,
          data: callCount === 1 ? initialConfig : updatedConfig,
        };
      }
      return { status: 200, data: { status: "UP" } };
    });

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.config).toEqual(initialConfig);
    });

    // Trigger jwt-available event wrapped in act
    await act(async () => {
      window.dispatchEvent(new CustomEvent("jwt-available"));
      // Wait a tick for event handler to run
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(result.current.config).toEqual(updatedConfig);
    });

    // 2 logical fetches * 2 calls each = 4 total calls
    expect(apiClient.get).toHaveBeenCalledTimes(4);
  });

  it("should provide refetch function", async () => {
    const mockConfig = {
      enableLogin: false,
      appNameNavbar: "Test App",
    };

    mockApiResponses(mockConfig);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.config).toEqual(mockConfig);
    });

    // Call refetch wrapped in act
    await act(async () => {
      await result.current.refetch();
    });

    // 2 logical fetches * 2 calls each = 4 total calls
    expect(apiClient.get).toHaveBeenCalledTimes(4);
  });

  it("should not fetch twice without force flag", async () => {
    const mockConfig = {
      enableLogin: false,
    };

    mockApiResponses(mockConfig);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.config).toEqual(mockConfig);
    });

    // Should only be called twice (one logical fetch = /app-config + /info/status)
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("should handle initial config prop", async () => {
    const initialConfig = {
      enableLogin: false,
      appNameNavbar: "Initial App",
    };

    mockApiResponses({ ...initialConfig, fromApi: true });

    const customWrapper = ({ children }: { children: ReactNode }) => (
      <AppConfigProvider initialConfig={initialConfig}>
        {children}
      </AppConfigProvider>
    );

    const { result } = renderHook(() => useAppConfig(), {
      wrapper: customWrapper,
    });

    // With blocking mode (default), should still fetch even with initial config
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should still make API call
    expect(apiClient.get).toHaveBeenCalled();
  });

  it("should use suppressErrorToast for all config requests", async () => {
    const mockConfig = { enableLogin: true };
    mockApiResponses(mockConfig);

    renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/api/v1/config/app-config", {
        suppressErrorToast: true,
        skipAuthRedirect: true,
      });
    });
  });
});
