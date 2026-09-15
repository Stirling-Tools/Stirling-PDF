import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  QuickNavHostProvider,
  useQuickNavHost,
} from "@app/contexts/QuickNavHostContext";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import { QuickNavRailAccount } from "@app/components/shared/quickNav/QuickNavRailAccount";

const { auth, picture, getAccountData } = vi.hoisted(() => ({
  auth: {
    displayName: "Ada" as string | null,
    loading: false,
    isAnonymous: false,
  },
  picture: { url: "/ada.png" as string | null, loading: false },
  getAccountData: vi.fn(),
}));

vi.mock("@app/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@app/hooks/useProfilePictureUrl", () => ({
  useProfilePictureUrl: () => picture.url,
  useProfilePictureLoading: () => picture.loading,
}));
vi.mock("@app/services/accountService", () => ({
  accountService: { getAccountData },
}));
vi.mock("@app/services/thumbnailGenerationService", () => ({
  thumbnailGenerationService: { generateThumbnails: vi.fn(async () => []) },
}));

function Account() {
  const host = useQuickNavHost();
  return (
    <QuickNavRailAccount identity={host?.identity ?? null} onOpen={() => {}} />
  );
}

function setup(enableLogin = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const markup = (view: string | null) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <QuickNavHostProvider>
          <Account />
          {view && (
            <AppConfigProvider
              key={view}
              autoFetch={false}
              bootstrapMode="non-blocking"
              initialConfig={{ enableLogin }}
            >
              <QuickNavHostBridge />
            </AppConfigProvider>
          )}
        </QuickNavHostProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(markup("editor"));
  return (name: string | null) => view.rerender(markup(name));
}

describe("quick-nav identity during view switches", () => {
  beforeEach(() => {
    auth.displayName = "Ada";
    auth.loading = false;
    picture.url = "/ada.png";
    picture.loading = false;
    getAccountData.mockReset();
  });

  it("keeps the name and avatar through unmount, session loading and picture loading", () => {
    const switchView = setup();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/ada.png");

    switchView(null);
    expect(screen.getByRole("button", { name: /Ada/ })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/ada.png");

    auth.displayName = null;
    auth.loading = true;
    picture.url = null;
    picture.loading = true;
    switchView("processor");
    expect(screen.getByRole("button", { name: /Ada/ })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/ada.png");

    auth.displayName = "Grace";
    auth.loading = false;
    switchView("processor");
    expect(screen.getByRole("button", { name: /Ada/ })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/ada.png");

    picture.url = "/grace.png";
    picture.loading = false;
    switchView("processor");
    expect(screen.getByRole("button", { name: /Grace/ })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/grace.png");

    auth.displayName = null;
    picture.url = null;
    auth.loading = true;
    switchView("editor");
    expect(screen.getByRole("button", { name: /Grace/ })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/grace.png");

    auth.loading = false;
    switchView("editor");
    expect(
      screen.getByRole("button", { name: /auth.displayName.user/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("waits for the account endpoint before replacing an identity without an auth name", async () => {
    let resolveAccount = (_value: { username: string }) => {};
    getAccountData.mockReturnValue(
      new Promise<{ username: string }>((resolve) => {
        resolveAccount = resolve;
      }),
    );
    const switchView = setup(true);

    auth.displayName = null;
    picture.url = null;
    switchView("processor");
    expect(screen.getByRole("button", { name: /Ada/ })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/ada.png");

    await act(async () => resolveAccount({ username: "Grace" }));
    expect(screen.getByRole("button", { name: /Grace/ })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("replaces the cached identity when the account lookup rejects after sign-out", async () => {
    let rejectAccount = (_reason: Error) => {};
    getAccountData.mockReturnValue(
      new Promise<never>((_resolve, reject) => {
        rejectAccount = reject;
      }),
    );
    const switchView = setup(true);

    auth.displayName = null;
    picture.url = null;
    switchView("processor");
    expect(screen.getByRole("button", { name: /Ada/ })).toBeInTheDocument();

    await act(async () => rejectAccount(new Error("Signed out")));
    expect(
      screen.getByRole("button", { name: /auth.displayName.user/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
