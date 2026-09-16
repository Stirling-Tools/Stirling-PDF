import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  QuickNavHostProvider,
  useQuickNavHost,
} from "@app/contexts/QuickNavHostContext";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import { fetchSigningSessions, type SigningSessions } from "@app/api/signing";
import { alert } from "@app/components/toast";
import { expectConsole } from "@app/tests/failOnConsole";

const { auth, access } = vi.hoisted(() => ({
  auth: { user: { id: "ada" } as { id: string } | null, loading: false },
  access: { granted: true, settled: true },
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({
    ...auth,
    displayName: auth.user?.id ?? null,
    isAnonymous: false,
  }),
}));
vi.mock("@app/hooks/useProcessorAccess", () => ({
  useProcessorAccessState: () => access,
}));
vi.mock("@app/api/signing", () => ({ fetchSigningSessions: vi.fn() }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@app/components/shared/quickNav/useQuickNavToolReasons", () => ({
  useQuickNavToolReasons: () => null,
}));
vi.mock("@app/services/thumbnailGenerationService", () => ({
  thumbnailGenerationService: { generateThumbnails: vi.fn(async () => []) },
}));

const mockFetch = vi.mocked(fetchSigningSessions);
const EMPTY: SigningSessions = { signRequests: [], mySessions: [] };
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

function RailState() {
  const host = useQuickNavHost();
  return (
    <>
      <output data-testid="access">{String(host?.processorAccess)}</output>
      <output data-testid="badge">{host?.signingBadge}</output>
    </>
  );
}

function setup() {
  const clients = {
    editor: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    processor: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
  };
  const markup = (
    app: keyof typeof clients | null,
    configReady = true,
    signingEnabled = true,
  ) => (
    <MemoryRouter>
      <QuickNavHostProvider>
        <RailState />
        {app && (
          <QueryClientProvider key={app} client={clients[app]}>
            <AppConfigProvider
              autoFetch={false}
              bootstrapMode="non-blocking"
              initialConfig={
                configReady
                  ? { storageGroupSigningEnabled: signingEnabled }
                  : null
              }
            >
              <QuickNavHostBridge />
            </AppConfigProvider>
          </QueryClientProvider>
        )}
      </QuickNavHostProvider>
    </MemoryRouter>
  );
  const view = render(markup("editor"));
  return (
    app: keyof typeof clients | null,
    configReady = true,
    signingEnabled = true,
  ) => view.rerender(markup(app, configReady, signingEnabled));
}

function expectRail(granted: boolean, count: number) {
  expect(screen.getByTestId("access")).toHaveTextContent(String(granted));
  expect(screen.getByTestId("badge")).toHaveTextContent(String(count));
}

describe("quick-nav account data during view switches", () => {
  beforeEach(() => {
    auth.user = { id: "ada" };
    auth.loading = false;
    access.granted = true;
    access.settled = true;
    localStorage.clear();
    mockFetch.mockReset();
    vi.mocked(alert).mockClear();
    mockFetch.mockResolvedValue(UNREAD);
  });

  it("retains access and the count until each incoming lookup settles", async () => {
    const switchView = setup();
    await waitFor(() => expectRail(true, 1));
    switchView(null);
    expectRail(true, 1);

    let resolveSessions = (_value: SigningSessions) => {};
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveSessions = resolve;
      }),
    );
    auth.user = null;
    auth.loading = true;
    access.granted = false;
    access.settled = false;
    switchView("processor", false);
    expectRail(true, 1);

    auth.user = { id: "ada" };
    auth.loading = false;
    switchView("processor", false);
    expectRail(true, 1);

    switchView("processor");
    expectRail(true, 1);
    access.settled = true;
    switchView("processor");
    expectRail(false, 1);

    await act(async () => resolveSessions(EMPTY));
    await waitFor(() => expectRail(false, 0));

    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveSessions = resolve;
      }),
    );
    access.settled = false;
    switchView("editor", false);
    expectRail(false, 0);
    switchView("editor");
    expectRail(false, 0);
    await act(async () => resolveSessions(UNREAD));
    await waitFor(() => expectRail(false, 1));
    switchView("editor", true, false);
    expectRail(false, 0);
  });

  it("keeps the previous count when the incoming signing request fails", async () => {
    const switchView = setup();
    await waitFor(() => expectRail(true, 1));
    expectConsole.error(/Failed to fetch signing data/);
    let rejectSessions = (_error: Error) => {};
    mockFetch.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSessions = reject;
      }),
    );
    switchView("processor");
    await act(async () => rejectSessions(new Error("Network unavailable")));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expectRail(true, 1);
  });

  it("drops the previous account's values during an account change and sign-out", async () => {
    const switchView = setup();
    await waitFor(() => expectRail(true, 1));
    let resolveSessions = (_value: SigningSessions) => {};
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveSessions = resolve;
      }),
    );

    auth.user = { id: "grace" };
    access.settled = false;
    switchView("editor");
    expectRail(false, 0);

    access.settled = true;
    switchView("editor");
    await act(async () => resolveSessions(UNREAD));
    await waitFor(() => expectRail(true, 1));

    mockFetch.mockResolvedValue(EMPTY);
    auth.user = null;
    access.granted = false;
    access.settled = true;
    switchView("editor");
    expectRail(false, 0);
  });
});
