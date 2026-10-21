import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { StartupPrompts } from "@app/components/startup/StartupPrompts";

const h = vi.hoisted(() => ({
  anonymous: false,
  get: vi.fn(),
  consent: vi.fn(),
}));
vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({
    user: { id: "cloud-user" },
    isAnonymous: h.anonymous,
    loading: false,
    signOut: vi.fn(),
  }),
}));
vi.mock("@app/hooks/useCookieConsentInitialization", () => ({
  useCookieConsentInitialization: () => h.consent(),
}));
vi.mock("@app/hooks/usePosthogTracking", () => ({
  usePosthogTracking: () => {},
}));
vi.mock("@app/hooks/useScarfTracking", () => ({ useScarfTracking: () => {} }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([false, true])(
  "shows consent for a hosted account (guest=%s) without Spring account APIs",
  async (anonymous) => {
    h.anonymous = anonymous;
    h.get.mockImplementation(async (url: string) => {
      if (url === "/api/v1/config/app-config")
        return { data: { enableLogin: true, enableAnalytics: true } };
      if (url === "/api/v1/config/login-disclaimer")
        return { data: { enabled: false } };
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const view = render(
      <MemoryRouter initialEntries={["/processor"]}>
        <QueryClientProvider client={client}>
          <AppConfigProvider>
            <StartupPrompts />
          </AppConfigProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(h.consent).toHaveBeenCalled());
    expect(h.get.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/config/app-config",
      "/api/v1/config/login-disclaimer",
    ]);
    view.unmount();
    client.clear();
  },
);
