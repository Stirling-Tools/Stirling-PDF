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

// Deterministic i18n: keys returned verbatim.
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
  });

  it("opens the builder when creating a pipeline", async () => {
    renderView();
    await screen.findByText("Redaction sweep");
    fireEvent.click(screen.getByText("portal.pipelines.actions.newPipeline"));
    expect(await screen.findByText("builder new")).toBeInTheDocument();
  });

  it("opens a pipeline's own page when its row is clicked", async () => {
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
