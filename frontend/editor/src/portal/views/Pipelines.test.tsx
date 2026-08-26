import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PipelinesOverviewResponse } from "@portal/api/pipelines";
import { Pipelines } from "@portal/views/Pipelines";

const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) => baseRender(ui, { wrapper: PortalTestProviders, ...options });

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
}));

// The template gallery is out of scope here: keep the catalogue empty so the test focuses on the
// pipelines list.
vi.mock("@portal/queries/policies", () => ({
  usePoliciesOverview: () => ({ data: null, loading: false, error: null }),
}));

const RESPONSE: PipelinesOverviewResponse = {
  kpis: [
    { value: 2, description: "" },
    { value: 2, description: "" },
    { value: 0, description: "" },
  ],
  pipelines: [
    {
      id: "plc-redaction",
      name: "Redaction sweep",
      enabled: true,
      required: false,
      status: "active",
      trigger: "schedule",
      sources: [{ id: "src-claims", name: "Claims intake" }],
      steps: ["/api/v1/security/auto-redact"],
      output: "inline",
      owner: "security@acme.com",
    },
  ],
};

function renderView(initial = "/processor/pipelines") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
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
    </MemoryRouter>,
  );
}

describe("Pipelines view", () => {
  beforeEach(() => {
    fetchPipelines.mockReset();
    fetchPipelines.mockResolvedValue(RESPONSE);
    fetchPipeline.mockReset();
    // A plain pipeline (no template origin) - parseSimplePolicy returns null, so the row opens the
    // full builder page.
    fetchPipeline.mockResolvedValue({
      id: "plc-redaction",
      name: "Redaction sweep",
      enabled: true,
      inputs: [],
      steps: [{ operation: "/api/v1/security/auto-redact", parameters: {} }],
      output: { type: "inline", options: {} },
      outputIds: [],
    });
  });

  it("opens the builder when creating a pipeline", async () => {
    renderView();
    await screen.findByText("Redaction sweep");
    fireEvent.click(
      screen.getByText("portal.pipelines.actions.newCustomPipeline"),
    );
    expect(await screen.findByText("builder new")).toBeInTheDocument();
  });

  it("opens the full builder when a plain pipeline row is clicked", async () => {
    renderView();
    fireEvent.click(await screen.findByText("Redaction sweep"));
    expect(await screen.findByText("pipeline page")).toBeInTheDocument();
  });

  it("shows the KPI stat boxes when pipelines exist", async () => {
    renderView();
    await screen.findByText("Redaction sweep");
    expect(screen.getByText("portal.pipelines.kpi.total")).toBeInTheDocument();
  });

  it("hides the stat boxes and shows create + connect-source CTAs when empty", async () => {
    fetchPipelines.mockResolvedValue({
      kpis: [
        { value: 0, description: "" },
        { value: 0, description: "" },
        { value: 0, description: "" },
      ],
      pipelines: [],
    });
    renderView();
    expect(
      await screen.findByText("portal.pipelines.empty.title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.empty.connectSource"),
    ).toBeInTheDocument();
    // The KPI strip is gone: no stat-box labels over an empty page.
    expect(
      screen.queryByText("portal.pipelines.kpi.total"),
    ).not.toBeInTheDocument();
  });
});
