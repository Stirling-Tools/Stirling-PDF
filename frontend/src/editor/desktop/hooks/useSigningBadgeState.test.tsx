import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncQuickNavAccount } from "@app/components/shared/quickNav/useSyncQuickNavAccount";
import {
  QuickNavHostProvider,
  useQuickNavHost,
} from "@app/contexts/QuickNavHostContext";
import { fetchSigningSessions, type SigningSessions } from "@app/api/signing";
import { authService } from "@app/services/authService";
import { connectionModeService } from "@app/services/connectionModeService";
import { alert } from "@app/components/toast";
import { expectConsole } from "@app/tests/failOnConsole";

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: "ada" }, loading: false, displayName: "Ada" }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: { storageGroupSigningEnabled: true },
    loading: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@app/services/authService", () => ({
  authService: { isAuthenticated: vi.fn(), subscribeToAuth: vi.fn() },
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: vi.fn(),
    subscribeToModeChanges: vi.fn(),
  },
}));
vi.mock("@app/api/signing", () => ({ fetchSigningSessions: vi.fn() }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

const UNREAD: SigningSessions = {
  signRequests: [],
  mySessions: [
    {
      sessionId: "session-1",
      documentName: "Document.pdf",
      createdAt: "2026-09-14T12:00:00Z",
      participantCount: 2,
      signedCount: 1,
      finalized: false,
    },
  ],
};
const mockFetch = vi.mocked(fetchSigningSessions);

function SyncAccount() {
  useSyncQuickNavAccount();
  return null;
}

function Badge() {
  return <output data-testid="badge">{useQuickNavHost()?.signingBadge}</output>;
}

function setup() {
  const clients = {
    editor: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    settings: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    docs: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
  const markup = (view: keyof typeof clients) => (
    <QuickNavHostProvider>
      <Badge />
      <QueryClientProvider key={view} client={clients[view]}>
        <SyncAccount />
      </QueryClientProvider>
    </QuickNavHostProvider>
  );
  const view = render(markup("editor"));
  return (next: keyof typeof clients) => view.rerender(markup(next));
}

describe("desktop signing badge availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
      "selfhosted",
    );
    vi.mocked(connectionModeService.subscribeToModeChanges).mockReturnValue(
      () => {},
    );
    vi.mocked(authService.isAuthenticated).mockResolvedValue(true);
    vi.mocked(authService.subscribeToAuth).mockImplementation((listener) => {
      listener("unauthenticated", null);
      return () => {};
    });
    mockFetch.mockResolvedValue(UNREAD);
  });

  it.each(["mode", "auth"])(
    "retains the badge while %s is the last desktop check to resolve, including a failed replacement fetch",
    async (last) => {
      const switchView = setup();
      await waitFor(() =>
        expect(screen.getByTestId("badge")).toHaveTextContent("1"),
      );
      let releaseMode = () => {};
      let releaseAuth = () => {};
      const modeBlocked = new Promise<void>((resolve) => {
        releaseMode = resolve;
      });
      const authBlocked = new Promise<void>((resolve) => {
        releaseAuth = resolve;
      });
      vi.mocked(connectionModeService.getCurrentMode).mockImplementationOnce(
        async () => {
          await modeBlocked;
          return "selfhosted";
        },
      );
      vi.mocked(authService.isAuthenticated).mockImplementationOnce(
        async () => {
          await authBlocked;
          return true;
        },
      );
      expectConsole.error(/Failed to fetch signing data/);
      mockFetch.mockRejectedValueOnce(new Error("Offline"));
      switchView("settings");
      expect(screen.getByTestId("badge")).toHaveTextContent("1");
      await act(async () => (last === "mode" ? releaseAuth() : releaseMode()));
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("badge")).toHaveTextContent("1");
      await act(async () => (last === "mode" ? releaseMode() : releaseAuth()));
      await waitFor(() => expect(alert).toHaveBeenCalled());
      expect(screen.getByTestId("badge")).toHaveTextContent("1");

      mockFetch.mockResolvedValue({ signRequests: [], mySessions: [] });
      switchView("docs");
      await waitFor(() =>
        expect(screen.getByTestId("badge")).toHaveTextContent("0"),
      );
    },
  );

  it.each(["local", "signed-out"])(
    "clears the badge after confirming %s availability",
    async (disabled) => {
      const switchView = setup();
      await waitFor(() =>
        expect(screen.getByTestId("badge")).toHaveTextContent("1"),
      );
      if (disabled === "local") {
        vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
          "local",
        );
      } else {
        vi.mocked(authService.isAuthenticated).mockResolvedValue(false);
      }
      switchView("settings");
      expect(screen.getByTestId("badge")).toHaveTextContent("1");
      await waitFor(() =>
        expect(screen.getByTestId("badge")).toHaveTextContent("0"),
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );
});
