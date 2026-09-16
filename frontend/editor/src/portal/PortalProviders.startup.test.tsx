import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { PortalProviders } from "@portal/PortalProviders";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  auth: {
    user: { id: "admin", orgOwner: true },
    loading: false,
    isAdmin: true,
    isAnonymous: false,
    signOut: vi.fn(),
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@app/auth", () => ({ useAuth: () => h.auth }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => h.auth }));
vi.mock("@app/services/apiClient", () => ({ default: { get: h.get } }));
vi.mock("@app/extensions/accountLogout", () => ({
  useAccountLogout: () => vi.fn(),
}));
vi.mock("@app/contexts/LicenseContext", () => ({
  LicenseProvider: ({ children }: { children: ReactNode }) => children,
  useLicense: () => ({ licenseInfo: null, loading: false }),
}));
vi.mock("@app/contexts/CheckoutContext", () => ({
  CheckoutProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@portal/contexts/TierContext", () => ({
  TierProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@portal/contexts/LinkContext", () => ({
  LinkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@portal/contexts/AccountLinkContext", () => ({
  AccountLinkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@portal/contexts/UIContext", () => ({
  UIProvider: ({ children }: { children: ReactNode }) => children,
  useUI: () => ({ linkModalOpen: false }),
}));
vi.mock("@portal/components/account-link/LinkAccountModal", () => ({
  LinkAccountModal: () => null,
}));
vi.mock("@portal/components/account-link/ConnectCallbackHost", () => ({
  ConnectCallbackHost: () => null,
}));
vi.mock("@portal/hooks/useFreeTierExhaustedPrompt", () => ({
  useFreeTierExhaustedPrompt: () => {},
}));
vi.mock("@portal/components/PortalChrome", () => ({
  PortalChrome: () => <div>Processor</div>,
}));
vi.mock("@app/components/onboarding/StaticOnboardingSlide", () => ({
  default: ({ slideId }: { slideId: string }) => (
    <div role="dialog" aria-label={slideId} />
  ),
}));
vi.mock("@app/hooks/useCookieConsentInitialization", () => ({
  useCookieConsentInitialization: () => {},
}));
vi.mock("@app/hooks/usePosthogTracking", () => ({
  usePosthogTracking: () => {},
}));
vi.mock("@app/hooks/useScarfTracking", () => ({ useScarfTracking: () => {} }));

afterEach(cleanup);

it("mounts mandatory setup on a cold Processor entry without editor providers", async () => {
  h.get.mockImplementation(async (url: string) => {
    if (url === "/api/v1/config/app-config")
      return {
        data: { enableLogin: true, isAdmin: true, enableAnalytics: false },
      };
    if (url === "/api/v1/proprietary/ui-data/account")
      return {
        data: { username: "admin", changeCredsFlag: true, settings: "{}" },
      };
    if (url === "/api/v1/proprietary/ui-data/login")
      return { data: { showDefaultCredentials: true } };
    throw new Error(`Unexpected request: ${url}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <MemoryRouter initialEntries={["/processor/policies"]}>
      <QueryClientProvider client={client}>
        <MantineProvider>
          <PortalProviders />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("dialog", { name: "first-login" }),
  ).toBeVisible();
  expect(screen.getByText("Processor")).toBeVisible();
  view.unmount();
  client.clear();
});
