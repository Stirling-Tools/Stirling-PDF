import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PipelinesOverviewResponse } from "@portal/api/pipelines";
import { Pipelines } from "@portal/views/Pipelines";

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

function renderView(initial = "/portal/pipelines") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/portal/pipelines" element={<Pipelines />} />
        <Route path="/portal/pipelines/new" element={<div>builder new</div>} />
        <Route
          path="/portal/pipelines/:id"
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
});
