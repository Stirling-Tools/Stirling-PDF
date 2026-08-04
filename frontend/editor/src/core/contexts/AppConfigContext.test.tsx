import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { waitFor, renderHook, act } from "@testing-library/react";
import {
  AppConfigProvider,
  useAppConfig,
} from "@app/contexts/AppConfigContext";
import apiClient from "@app/services/apiClient";
import { allowConsole, expectConsole } from "@app/tests/failOnConsole";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    <TestQueryProvider>
      <AppConfigProvider>{children}</AppConfigProvider>
    </TestQueryProvider>
  );

  it("should fetch and provide app config on non-auth pages", async () => {
    const mockConfig = {
      enableLogin: false,
      appNameNavbar: "Stirling PDF",
      languages: ["en-US", "en-GB"],
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      status: 200,
      data: mockConfig,
    } as any);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.error).toBeNull();
    });

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
    vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual({ enableLogin: true });
      // 401 should be handled gracefully, error may be null or set
    });
  });

  it("should handle network errors", async () => {
    expectConsole.error(/\[AppConfig\] Failed to fetch app config/);
    const errorMessage = "Network error occurred";
    const mockError = new Error(errorMessage);
    // Network errors don't have response property
    // Mock rejection for all retry attempts (default is 3 attempts)
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(mockError)
      .mockRejectedValueOnce(mockError)
      .mockRejectedValueOnce(mockError);

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

    // First call returns initial config
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      status: 200,
      data: initialConfig,
    } as any);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.config).toEqual(initialConfig);
    });

    // Setup second call for refetch
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      status: 200,
      data: updatedConfig,
    } as any);

    // Trigger jwt-available event wrapped in act
    await act(async () => {
      window.dispatchEvent(new CustomEvent("jwt-available"));
      // Wait a tick for event handler to run
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(result.current.config).toEqual(updatedConfig);
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("should provide refetch function", async () => {
    const mockConfig = {
      enableLogin: false,
      appNameNavbar: "Test App",
    };

    vi.mocked(apiClient.get).mockResolvedValue({
      status: 200,
      data: mockConfig,
    } as any);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.config).toEqual(mockConfig);
    });

    // Call refetch wrapped in act
    await act(async () => {
      await result.current.refetch();
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("should not fetch twice without force flag", async () => {
    const mockConfig = {
      enableLogin: false,
    };

    vi.mocked(apiClient.get).mockResolvedValue({
      status: 200,
      data: mockConfig,
    } as any);

    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.config).toEqual(mockConfig);
    });

    // Should only be called once (no duplicate fetches)
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it("should handle initial config prop", async () => {
    // apiClient.get isn't mocked here, so the implicit "fetch fails" path
    // exhausts retries and logs. Test only asserts the API was called, so
    // the failure log is incidental.
    allowConsole.error(/\[AppConfig\] Failed to fetch app config/);
    const initialConfig = {
      enableLogin: false,
      appNameNavbar: "Initial App",
    };

    const customWrapper = ({ children }: { children: ReactNode }) => (
      <TestQueryProvider>
        <AppConfigProvider initialConfig={initialConfig}>
          {children}
        </AppConfigProvider>
      </TestQueryProvider>
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

  it("serves a remounted provider from cache", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      status: 200,
      data: { enableLogin: false },
    } as any);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <AppConfigProvider>{children}</AppConfigProvider>
      </QueryClientProvider>
    );

    const first = renderHook(() => useAppConfig(), { wrapper: sharedWrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const second = renderHook(() => useAppConfig(), { wrapper: sharedWrapper });
    // Cached, so no loading flash and no second request.
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.config).toEqual({ enableLogin: false });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it("honours maxRetries for network failures", async () => {
    expectConsole.error(/\[AppConfig\] Failed to fetch app config/);
    vi.mocked(apiClient.get).mockRejectedValue(new Error("boom"));

    const retryWrapper = ({ children }: { children: ReactNode }) => (
      <TestQueryProvider>
        <AppConfigProvider retryOptions={{ maxRetries: 2, initialDelay: 1 }}>
          {children}
        </AppConfigProvider>
      </TestQueryProvider>
    );

    const { result } = renderHook(() => useAppConfig(), {
      wrapper: retryWrapper,
    });

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(apiClient.get).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx", async () => {
    expectConsole.error(/\[AppConfig\] Failed to fetch app config/);
    vi.mocked(apiClient.get).mockRejectedValue(
      Object.assign(new Error("nope"), { response: { status: 403, data: {} } }),
    );

    const retryWrapper = ({ children }: { children: ReactNode }) => (
      <TestQueryProvider>
        <AppConfigProvider retryOptions={{ maxRetries: 5, initialDelay: 1 }}>
          {children}
        </AppConfigProvider>
      </TestQueryProvider>
    );

    const { result } = renderHook(() => useAppConfig(), {
      wrapper: retryWrapper,
    });

    await waitFor(() => expect(result.current.error).toBe("nope"));
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when autoFetch is off", async () => {
    const offWrapper = ({ children }: { children: ReactNode }) => (
      <TestQueryProvider>
        <AppConfigProvider
          initialConfig={{ enableLogin: false }}
          bootstrapMode="non-blocking"
          autoFetch={false}
        >
          {children}
        </AppConfigProvider>
      </TestQueryProvider>
    );

    const { result } = renderHook(() => useAppConfig(), {
      wrapper: offWrapper,
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.config).toEqual({ enableLogin: false });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("should use suppressErrorToast for all config requests", async () => {
    const mockConfig = { enableLogin: true };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      status: 200,
      data: mockConfig,
    } as any);

    renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/api/v1/config/app-config", {
        suppressErrorToast: true,
        skipAuthRedirect: true,
      });
    });
  });
});
