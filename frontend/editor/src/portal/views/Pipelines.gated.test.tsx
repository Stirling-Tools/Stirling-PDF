import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortalViewProviders } from "@portal/test/TestQueryProvider";

/**
 * The page must look exactly as it always does: the ask is a dialog on the attempt, not a lock
 * screen in place of the feature. The route half is what a later link cannot walk around.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({
    gated: true,
    loading: false,
    available: true,
    connect,
    guard:
      <A extends unknown[]>(_action: (...args: A) => void) =>
      () =>
        connect(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchPipelines = vi.fn();
vi.mock("@portal/api/pipelines", () => ({
  fetchPipelines: () => fetchPipelines(),
}));

import { Pipelines } from "@portal/views/Pipelines";
import { ConnectGuardedRoute } from "@portal/components/account-link/ConnectGuardedRoute";

const PIPELINE = {
  id: "plc-1",
  name: "Redact claims",
  enabled: true,
  status: "active",
  trigger: "schedule",
  sources: [{ id: "src-claims", name: "Claims intake" }],
  steps: ["/api/v1/security/auto-redact"],
  output: "inline",
  owner: "security@acme.com",
};

function renderAt(initial: string) {
  return render(
    <PortalViewProviders>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/processor/pipelines" element={<Pipelines />} />
          <Route
            path="/processor/pipelines/new"
            element={
              <ConnectGuardedRoute fallback="/processor/pipelines">
                <div>builder</div>
              </ConnectGuardedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </PortalViewProviders>,
  );
}

describe("Pipelines when the account is not connected", () => {
  beforeEach(() => {
    connect.mockReset();
    fetchPipelines.mockReset();
  });

  it("leaves the empty state exactly as it is", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [] });
    renderAt("/processor/pipelines");
    expect(
      await screen.findByText("portal.pipelines.empty.title"),
    ).toBeInTheDocument();
  });

  it("still lists pipelines that already exist", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [PIPELINE] });
    renderAt("/processor/pipelines");
    expect(await screen.findByText("Redact claims")).toBeInTheDocument();
  });

  it("asks to connect instead of opening the builder", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [] });
    renderAt("/processor/pipelines");
    await screen.findByText("portal.pipelines.empty.title");
    fireEvent.click(screen.getByText("portal.pipelines.actions.newPipeline"));
    expect(connect).toHaveBeenCalled();
    expect(screen.queryByText("builder")).toBeNull();
  });

  it("asks to connect instead of opening an existing pipeline", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [PIPELINE] });
    renderAt("/processor/pipelines");
    fireEvent.click(await screen.findByText("Redact claims"));
    expect(connect).toHaveBeenCalled();
  });

  it("turns away a direct arrival at the builder, however it was reached", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [] });
    renderAt("/processor/pipelines/new");
    expect(
      await screen.findByText("portal.pipelines.empty.title"),
    ).toBeInTheDocument();
    expect(screen.queryByText("builder")).toBeNull();
    expect(connect).toHaveBeenCalled();
  });
});
