import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConnectGuardedRoute } from "@portal/components/account-link/ConnectGuardedRoute";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider } from "@portal/contexts/UIContext";

/** Over the real provider stack: pins apart not-yet-known, never-knowable and truly unlinked. */
const { json, fetchStatus } = vi.hoisted(() => ({
  json: vi.fn(),
  fetchStatus: vi.fn(),
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
  const { gated, available } = useConnectGate();
  return (
    <span data-testid="g">{`${available ? "avail" : "unavail"}:${gated ? "gated" : "open"}`}</span>
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

describe("connect gate and the link status", () => {
  it("stays open while the status is still in flight", async () => {
    configSaysAvailable();
    let resolve!: (v: unknown) => void;
    fetchStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    renderStack();
    await waitFor(() => expect(state()).toBe("avail:open"));
    expect(state()).toContain("open");
    expect(
      screen.getByRole("heading", { name: "Pipeline builder" }),
    ).toBeInTheDocument();
    await act(async () => resolve({ linked: true, name: "acme" }));
  });

  it("stays open once a linked status arrives", async () => {
    configSaysAvailable();
    fetchStatus.mockResolvedValue({ linked: true, name: "acme" });
    renderStack();
    await waitFor(() => expect(state()).toBe("avail:open"));
    expect(state()).toContain("open");
  });

  it("stays open when the status call fails, rather than assuming unlinked", async () => {
    configSaysAvailable();
    fetchStatus.mockRejectedValue(
      new Error("401 once the admin session lapsed"),
    );
    renderStack();
    await waitFor(() => expect(state()).toBe("avail:open"));
    expect(state()).toContain("open");
  });

  it("still gates once the status says the instance really is unlinked", async () => {
    configSaysAvailable();
    fetchStatus.mockResolvedValue({ linked: false, name: null });
    renderStack();
    await waitFor(() => expect(state()).toBe("avail:gated"));
    expect(
      await screen.findByRole("heading", { name: "Pipelines list" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pipeline builder" }),
    ).not.toBeInTheDocument();
  });
});

describe("pipeline routes with unknown link status", () => {
  it.each([
    ["/processor/pipelines/new", false],
    ["/processor/pipelines/plc-1", false],
    ["/processor/pipelines/new", true],
    ["/processor/pipelines/plc-1", true],
  ])(
    "renders %s after a failed status request (link available: %s)",
    async (path, accountLinkAvailable) => {
      json.mockResolvedValue({ accountLinkAvailable });
      fetchStatus.mockRejectedValue(new Error("Link status unavailable"));
      renderStack(path);
      await waitFor(() =>
        expect(state()).toBe(
          `${accountLinkAvailable ? "avail" : "unavail"}:open`,
        ),
      );
      expect(
        await screen.findByRole("heading", { name: "Pipeline builder" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Pipelines list" }),
      ).not.toBeInTheDocument();
    },
  );
});
