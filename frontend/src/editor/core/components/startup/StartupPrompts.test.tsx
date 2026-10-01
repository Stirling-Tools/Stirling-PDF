import { type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import {
  AppConfigProvider,
  type AppConfig,
} from "@app/contexts/AppConfigContext";
import { AppLayout } from "@app/components/AppLayout";
import { AppRoot } from "@app/components/layout/AppRoot";
import { BannerProvider } from "@app/contexts/BannerContext";
import type StaticOnboardingSlide from "@app/components/onboarding/StaticOnboardingSlide";
import type { AccountData } from "@app/services/accountService";
import type { useAuth } from "@app/auth/UseSession";

const h = vi.hoisted<{
  auth: Pick<ReturnType<typeof useAuth>, "user" | "loading" | "isAnonymous"> & {
    signOut: Mock;
  };
  get: Mock;
  post: Mock;
  logout: Mock;
  tracking: Mock;
}>(() => ({
  auth: {
    user: { id: "admin" },
    loading: false,
    isAnonymous: false,
    signOut: vi.fn(),
  },
  get: vi.fn(),
  post: vi.fn(),
  logout: vi.fn(),
  tracking: vi.fn(),
}));
vi.mock("@app/pages/HomePage", () => ({ default: () => null }));
vi.mock("@app/pages/SettingsPage", () => ({ default: () => null }));
vi.mock("@app/components/docs/DocsPage", () => ({ default: () => null }));
vi.mock("@app/components/shared/NavigationWarningModal", () => ({
  default: () => null,
}));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => h.auth }));
vi.mock("@app/services/apiClient", () => ({
  default: { get: h.get, post: h.post },
}));
vi.mock("@app/extensions/accountLogout", () => ({
  useAccountLogout: () => h.logout,
}));
vi.mock("@app/hooks/useCookieConsentInitialization", () => ({
  useCookieConsentInitialization: () => h.tracking(),
}));
vi.mock("@app/hooks/useScarfTracking", () => ({ useScarfTracking: () => {} }));
vi.mock("@app/hooks/usePosthogTracking", () => ({
  usePosthogTracking: () => {},
}));
vi.mock("@app/components/onboarding/StaticOnboardingSlide", () => ({
  default: ({
    slideId,
    params,
    onAction,
    allowDismiss,
  }: ComponentProps<typeof StaticOnboardingSlide>) => (
    <div role="dialog" aria-label={slideId} data-dismissible={allowDismiss}>
      {params?.firstLoginUsername}
      <span>{params?.analyticsError}</span>
      <button onClick={() => onAction("disable-analytics")}>
        Decline analytics
      </button>
      <button onClick={() => params?.onPasswordChanged?.()}>
        Change password
      </button>
      <button onClick={() => params?.onMfaSetupComplete?.()}>Finish MFA</button>
    </div>
  ),
}));

let config: AppConfig;
let account: AccountData;
let disclaimer: {
  enabled: boolean;
  showInAnonymousMode: boolean;
  content: string;
  format: string;
};
const clients: QueryClient[] = [];

function Navigation() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/processor/policies")}>
      Go to Processor
    </button>
  );
}

function TestApp({ path, client }: { path: string; client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <MantineProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppConfigProvider>
            <BannerProvider>
              <AppLayout>
                <AppRoot />
                <Navigation />
              </AppLayout>
            </BannerProvider>
          </AppConfigProvider>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

function renderAt(
  path: string,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }),
) {
  clients.push(client);
  const view = render(<TestApp path={path} client={client} />);
  return {
    ...view,
    refresh: () => view.rerender(<TestApp path={path} client={client} />),
    client,
  };
}

describe("startup prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.auth.signOut.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    h.auth.user = { id: "admin" };
    h.auth.loading = false;
    h.auth.isAnonymous = false;
    config = { enableLogin: true, isAdmin: true, enableAnalytics: false };
    account = {
      username: "admin",
      role: "ROLE_ADMIN",
      settings: "{}",
      changeCredsFlag: false,
      oAuth2Login: false,
      saml2Login: false,
    };
    disclaimer = {
      enabled: false,
      showInAnonymousMode: false,
      content: "",
      format: "markdown",
    };
    h.get.mockImplementation(async (url: string) => {
      if (url === "/api/v1/config/app-config") return { data: { ...config } };
      if (url === "/api/v1/proprietary/ui-data/account")
        return { data: { ...account } };
      if (url === "/api/v1/proprietary/ui-data/login")
        return { data: { showDefaultCredentials: true } };
      if (url === "/api/v1/config/login-disclaimer")
        return { data: disclaimer };
      throw new Error(`Unexpected request: ${url}`);
    });
    h.post.mockImplementation(async () => {
      config = { ...config, enableAnalytics: false };
    });
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
  });

  it.each([
    "/editor",
    "/compress",
    "/settings/account",
    "/processor",
    "/processor/policies",
    "/share",
    "/share/",
    "/share/token/extra",
    "/invite",
    "/workflow/sign",
    "/mobile-scanner/extra",
    "/login/extra",
    "/auth",
    "/forgot-password",
    "/reset-password",
    "/oauth/consent",
    "/link",
  ])("requires the password change on direct entry to %s", async (path) => {
    account.changeCredsFlag = true;
    renderAt(path);
    const dialog = await screen.findByRole("dialog", { name: "first-login" });
    expect(dialog).toHaveTextContent("admin");
    expect(dialog).toHaveAttribute("data-dismissible", "false");
    expect(h.tracking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Change password"));
    expect(h.logout).toHaveBeenCalledWith(
      expect.objectContaining({ signOut: h.auth.signOut }),
    );
  });

  it("does not let tour bypass or completed onboarding suppress account setup", async () => {
    sessionStorage.setItem("onboarding::bypass-all", "true");
    localStorage.setItem("onboarding::completed", "true");
    account.changeCredsFlag = true;
    renderAt("/processor?bypassOnboarding=true");
    expect(
      await screen.findByRole("dialog", { name: "first-login" }),
    ).toBeVisible();
  });

  it("checks the account after an interactive login without a reload", async () => {
    h.auth.user = null;
    account.changeCredsFlag = true;
    const view = renderAt("/editor");
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    h.auth.user = { id: "admin" };
    view.refresh();
    expect(
      await screen.findByRole("dialog", { name: "first-login" }),
    ).toBeVisible();
  });

  it.each(["/processor", "/share"])(
    "sequences analytics, MFA, agreement and cookie consent on %s",
    async (path) => {
      config.enableAnalytics = null;
      account.mfaRequired = true;
      disclaimer = {
        enabled: true,
        showInAnonymousMode: false,
        content: "Company agreement",
        format: "markdown",
      };
      renderAt(path);
      expect(
        await screen.findByRole("dialog", { name: "analytics-choice" }),
      ).toBeVisible();
      expect(screen.queryByText("Company agreement")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("Decline analytics"));
      expect(
        await screen.findByRole("dialog", { name: "mfa-setup" }),
      ).toBeVisible();
      expect(h.post).toHaveBeenCalledWith(
        "/api/v1/settings/update-enable-analytics",
        expect.any(FormData),
      );
      expect((h.post.mock.calls[0][1] as FormData).get("enabled")).toBe(
        "false",
      );
      fireEvent.click(screen.getByText("Finish MFA"));
      expect(await screen.findByText("Company agreement")).toBeVisible();
      expect(h.tracking).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "loginAgreementAccept" }),
      );
      await waitFor(() => expect(h.tracking).toHaveBeenCalled());
    },
  );

  it("keeps the analytics prompt open when saving fails", async () => {
    config.enableAnalytics = null;
    h.post.mockRejectedValueOnce(new Error("Could not save"));
    renderAt("/processor");
    await screen.findByRole("dialog", { name: "analytics-choice" });
    fireEvent.click(screen.getByText("Decline analytics"));
    expect(await screen.findByText("Could not save")).toBeVisible();
    expect(h.tracking).not.toHaveBeenCalled();
  });

  it("uses the latest server choice when entering another app with stale config", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    client.setQueryData(["editor", "appConfig"], {
      ...config,
      enableAnalytics: null,
    });
    renderAt("/processor", client);
    await waitFor(() => expect(h.tracking).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves agreement acceptance when changing apps or reloading", async () => {
    disclaimer = {
      enabled: true,
      showInAnonymousMode: false,
      content: "Company agreement",
      format: "markdown",
    };
    const editor = renderAt("/editor");
    await screen.findByText("Company agreement");
    fireEvent.click(
      screen.getByRole("button", { name: "loginAgreementAccept" }),
    );
    await waitFor(() => expect(h.tracking).toHaveBeenCalled());
    editor.unmount();
    h.tracking.mockClear();
    renderAt("/processor");
    await waitFor(() => expect(h.tracking).toHaveBeenCalled());
    expect(screen.queryByText("Company agreement")).not.toBeInTheDocument();
  });

  it("allows login-disabled servers without calling account endpoints", async () => {
    config.enableLogin = false;
    h.auth.user = null;
    renderAt("/editor");
    await waitFor(() => expect(h.tracking).toHaveBeenCalled());
    expect(
      h.get.mock.calls.some(
        ([url]) => url === "/api/v1/proprietary/ui-data/account",
      ),
    ).toBe(false);
  });

  it("does not request MFA setup from an account that has already enabled it", async () => {
    account.mfaRequired = true;
    account.mfaEnabled = true;
    renderAt("/processor");
    await waitFor(() => expect(h.tracking).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not initialize consent while declining the login agreement", async () => {
    disclaimer = {
      enabled: true,
      showInAnonymousMode: false,
      content: "Company agreement",
      format: "markdown",
    };
    h.auth.signOut.mockReturnValue(new Promise(() => {}));
    renderAt("/processor");
    await screen.findByText("Company agreement");
    fireEvent.click(
      screen.getByRole("button", { name: "loginAgreementDecline" }),
    );
    await act(async () => {});
    expect(h.auth.signOut).toHaveBeenCalled();
    expect(h.tracking).not.toHaveBeenCalled();
  });

  it("offers a retry when the required account lookup fails", async () => {
    const get = h.get.getMockImplementation()!;
    let failed = true;
    h.get.mockImplementation(async (url: string) => {
      if (url === "/api/v1/proprietary/ui-data/account" && failed) {
        throw new Error("Account lookup unavailable");
      }
      return get(url);
    });
    account.changeCredsFlag = true;
    renderAt("/processor");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Account lookup unavailable",
    );
    expect(h.tracking).not.toHaveBeenCalled();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    expect(
      await screen.findByRole("dialog", { name: "first-login" }),
    ).toBeVisible();
  });
});
