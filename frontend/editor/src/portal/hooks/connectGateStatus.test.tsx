import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConnectGuardedRoute } from "@portal/components/account-link/ConnectGuardedRoute";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider } from "@portal/contexts/UIContext";

/** Over the real provider stack: pins apart not-yet-known, never-knowable and truly unlinked. */
const { json, fetchStatus, guardedAction } = vi.hoisted(() => ({
  json: vi.fn(),
  fetchStatus: vi.fn(),
  guardedAction: vi.fn(),
}));
vi.mock("@portal/api/http", () => ({
  apiClient: { local: { json } },
  errorMessage: String,
}));
vi.mock("@portal/api/link", () => ({
  fetchStatus,
  unlinkInstance: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: false,
}));

import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { useConnectGate } from "@portal/hooks/useConnectGate";

function Probe() {
  const { gated, available, guard } = useConnectGate();
  return (
    <>
      <span data-testid="g">{`${available ? "avail" : "unavail"}:${gated ? "gated" : "open"}`}</span>
      <button onClick={guard(guardedAction)}>Guarded action</button>
    </>
  );
}

const renderStack = (path = "/processor/pipelines/new") =>
  render(
    <PortalTestProviders>
      <LinkProvider initialState="unlinked" statusKnown={false}>
        <UIProvider>
          <AccountLinkProvider>
            <MemoryRouter initialEntries={[path]}>
              <Probe />
              <Routes>
                <Route
                  path="/processor/pipelines/:id"
                  element={
                    <ConnectGuardedRoute fallback="/processor/pipelines">
                      <h1>Pipeline builder</h1>
                    </ConnectGuardedRoute>
                  }
                />
                <Route
                  path="/processor/pipelines"
                  element={<h1>Pipelines list</h1>}
                />
              </Routes>
            </MemoryRouter>
          </AccountLinkProvider>
        </UIProvider>
      </LinkProvider>
    </PortalTestProviders>,
  );

const state = () => screen.getByTestId("g").textContent;
const configSaysAvailable = () =>
  json.mockResolvedValue({ accountLinkAvailable: true });

beforeEach(() => {
  vi.clearAllMocks();
  json.mockReset();
  fetchStatus.mockReset();
});
afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const builder = () =>
  screen.queryByRole("heading", { name: "Pipeline builder" });
const assertActionBlocked = () => {
  fireEvent.click(screen.getByRole("button", { name: "Guarded action" }));
  expect(guardedAction).not.toHaveBeenCalled();
};
const retry = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "portal.accountLink.gate.retry" }),
  );

describe("connect gate and the link status", () => {
  it("waits visibly for status without opening the builder or guarded actions", async () => {
    configSaysAvailable();
    let resolve!: (v: unknown) => void;
    fetchStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    renderStack();
    await waitFor(() => expect(state()).toBe("avail:open"));
    expect(
      screen.getByRole("status", { name: "portal.accountLink.gate.loading" }),
    ).toBeInTheDocument();
    expect(builder()).not.toBeInTheDocument();
    assertActionBlocked();
    await act(async () => resolve({ linked: true, name: "acme" }));
    expect(builder()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guarded action" }));
    expect(guardedAction).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    "retries a failed status check and respects linked=%s",
    async (linked) => {
      configSaysAvailable();
      fetchStatus
        .mockRejectedValueOnce(new Error("Status unavailable"))
        .mockResolvedValue({ linked, name: linked ? "acme" : null });
      renderStack();
      await screen.findByText("portal.accountLink.gate.error");
      expect(builder()).not.toBeInTheDocument();
      assertActionBlocked();
      retry();
      await screen.findByRole("heading", {
        name: linked ? "Pipeline builder" : "Pipelines list",
      });
      expect(fetchStatus).toHaveBeenCalledTimes(2);
      expect(
        screen.queryByText("portal.accountLink.gate.error"),
      ).not.toBeInTheDocument();
    },
  );

  it("does not honor the old dev bypass URL or stored flag for an unlinked instance", async () => {
    window.history.replaceState({}, "", "/processor?bypassConnect=true");
    sessionStorage.setItem("accountLink::dev-bypass", "true");
    configSaysAvailable();
    fetchStatus.mockResolvedValue({ linked: false, name: null });
    renderStack();
    await screen.findByRole("heading", { name: "Pipelines list" });
    expect(builder()).not.toBeInTheDocument();
    assertActionBlocked();
  });

  it("blocks when app configuration fails and retries without assuming linking is disabled", async () => {
    json
      .mockRejectedValueOnce(new Error("Configuration unavailable"))
      .mockResolvedValue({ accountLinkAvailable: false });
    fetchStatus.mockRejectedValue(new Error("No status endpoint"));
    renderStack();
    await screen.findByText("portal.accountLink.gate.error");
    expect(builder()).not.toBeInTheDocument();
    assertActionBlocked();
    retry();
    await screen.findByRole("heading", { name: "Pipeline builder" });
    expect(json).toHaveBeenCalledTimes(2);
  });
});

describe("pipeline routes with unknown link status", () => {
  it.each([
    ["/processor/pipelines/new", false],
    ["/processor/pipelines/plc-1", false],
    ["/processor/pipelines/new", true],
    ["/processor/pipelines/plc-1", true],
  ])(
    "requires status for %s only when linking is available (%s)",
    async (path, accountLinkAvailable) => {
      json.mockResolvedValue({ accountLinkAvailable });
      fetchStatus.mockRejectedValue(new Error("Link status unavailable"));
      renderStack(path);
      if (accountLinkAvailable) {
        await screen.findByText("portal.accountLink.gate.error");
        expect(builder()).not.toBeInTheDocument();
      } else {
        await screen.findByRole("heading", { name: "Pipeline builder" });
        expect(
          screen.queryByText("portal.accountLink.gate.error"),
        ).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole("heading", { name: "Pipelines list" }),
      ).not.toBeInTheDocument();
    },
  );
});
