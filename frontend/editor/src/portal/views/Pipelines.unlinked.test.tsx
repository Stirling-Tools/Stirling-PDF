import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortalViewProviders } from "@portal/test/TestQueryProvider";

/**
 * An instance with no Stirling account still runs pipelines, on its own monthly grant, so nothing
 * here asks for one up front. The wall is the server's 402 once the grant is spent, not a locked
 * button before the first run.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({
    gated: true,
    loading: false,
    available: true,
    connect,
    // Faithful to the real hook while gated, so re-guarding any of these actions fails the test
    // rather than passing through it.
    guard:
      <A extends unknown[]>(_action: (...args: A) => void) =>
      () =>
        connect(),
  }),
}));

// Deterministic i18n: keys returned verbatim. initReactI18next/Trans are exported too because the
// unified page pulls in modules (the policy wizard/catalogue) that reference them at import time.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
  Trans: (props: { children?: unknown }) => props.children,
}));

const fetchPipelines = vi.fn();
const fetchPipeline = vi.fn();
vi.mock("@portal/api/pipelines", () => ({
  fetchPipelines: () => fetchPipelines(),
  fetchPipeline: (id: string) => fetchPipeline(id),
  fetchPolicyPermissions: () => Promise.resolve({ canManagePolicies: true }),
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

function renderAt(initial: string) {
  return render(
    <PortalViewProviders>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/processor/pipelines" element={<Pipelines />} />
          <Route path="/processor/pipelines/new" element={<div>builder</div>} />
          <Route path="/processor/pipelines/:id" element={<div>builder</div>} />
        </Routes>
      </MemoryRouter>
    </PortalViewProviders>,
  );
}

describe("Pipelines on an instance with no Stirling account", () => {
  beforeEach(() => {
    connect.mockReset();
    fetchPipelines.mockReset();
    fetchPipeline.mockReset();
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

  it("opens the builder rather than asking for an account", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [] });
    renderAt("/processor/pipelines");
    await screen.findByText("portal.pipelines.empty.title");
    fireEvent.click(
      screen.getByText("portal.pipelines.actions.newCustomPipeline"),
    );
    expect(await screen.findByText("builder")).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });

  it("opens an existing pipeline rather than asking for an account", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [PIPELINE] });
    // Not representable as a simple policy, so the row routes to the full builder.
    fetchPipeline.mockResolvedValue({ ...PIPELINE, steps: PIPELINE.steps });
    renderAt("/processor/pipelines");
    fireEvent.click(await screen.findByText("Redact claims"));
    expect(await screen.findByText("builder")).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });

  it("lets a direct arrival at the builder through", async () => {
    fetchPipelines.mockResolvedValue({ kpis: [], pipelines: [] });
    renderAt("/processor/pipelines/new");
    expect(await screen.findByText("builder")).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });
});
