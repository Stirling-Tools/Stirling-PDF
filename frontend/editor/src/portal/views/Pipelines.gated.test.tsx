import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortalViewProviders } from "@portal/test/TestQueryProvider";

/**
 * The gate as a user meets it. Pipelines stands in for the five gated views: they all take the
 * same hook, so what is worth pinning here is the behaviour rather than the wiring.
 *
 * The decision this encodes is that gating covers creating and editing but never viewing, so an
 * upgrade cannot take away a pipeline that already runs.
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

function renderView() {
  return render(
    <PortalViewProviders>
      <MemoryRouter initialEntries={["/processor/pipelines"]}>
        <Routes>
          <Route path="/processor/pipelines" element={<Pipelines />} />
          <Route
            path="/processor/pipelines/new"
            element={<div>builder new</div>}
          />
          <Route
            path="/processor/pipelines/:id"
            element={<div>pipeline page</div>}
          />
        </Routes>
      </MemoryRouter>
    </PortalViewProviders>,
  );
}

describe("Pipelines view when the account is not connected", () => {
  beforeEach(() => {
    connect.mockReset();
    fetchPipelines.mockReset();
  });

  it("replaces the empty state with the connect gate", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [] });
    renderView();
    expect(
      await screen.findByText("portal.accountLink.gate.titleFeature"),
    ).toBeInTheDocument();
    expect(screen.queryByText("portal.pipelines.empty.title")).toBeNull();
  });

  it("asks to connect instead of opening the builder", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [] });
    renderView();
    await screen.findByText("portal.accountLink.gate.titleFeature");
    fireEvent.click(screen.getByText("portal.pipelines.actions.newPipeline"));
    expect(connect).toHaveBeenCalled();
    expect(screen.queryByText("builder new")).toBeNull();
  });

  it("still lists pipelines that already exist", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [PIPELINE] });
    renderView();
    expect(await screen.findByText("Redact claims")).toBeInTheDocument();
  });

  it("asks to connect instead of opening an existing pipeline", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [PIPELINE] });
    renderView();
    fireEvent.click(await screen.findByText("Redact claims"));
    expect(connect).toHaveBeenCalled();
    expect(screen.queryByText("pipeline page")).toBeNull();
  });
});
