import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ToolRegistryCatalog } from "@app/contexts/ToolRegistryContext";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";

// Deterministic i18n: keys returned verbatim.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchPipeline = vi.fn();
const fetchTriggers = vi.fn();
const savePipeline = vi.fn();
vi.mock("@portal/api/pipelines", () => ({
  fetchPipeline: (id: string) => fetchPipeline(id),
  fetchTriggers: () => fetchTriggers(),
  savePipeline: (policy: unknown) => savePipeline(policy),
}));

const fetchSources = vi.fn();
vi.mock("@portal/api/sources", () => ({
  fetchSources: () => fetchSources(),
}));

// One editable tool, Compress, so the picker and step settings have something to render.
vi.mock("@app/contexts/ToolRegistryContext", () => {
  const compress = {
    name: "Compress",
    icon: null,
    component: null,
    description: "",
    categoryId: "recommendedTools",
    subcategoryId: "general",
    automationSettings: () => null,
    operationConfig: {
      operationType: "compress",
      toolType: 0,
      endpoint: "/api/v1/misc/compress-pdf",
      defaultParameters: {},
      buildFormData: () => new FormData(),
      toApiParams: (params: Record<string, unknown>) => ({ ...params }),
      fromApiParams: (params: Record<string, unknown>) => ({ ...params }),
    },
  } as unknown as ToolRegistryEntry;
  const allTools = { compress } as unknown as ToolRegistryCatalog["allTools"];
  const catalog: ToolRegistryCatalog = {
    regularTools: allTools,
    superTools: allTools,
    linkTools: allTools,
    allTools,
    getToolById: () => null,
  };
  return { useToolRegistry: () => catalog };
});

function renderBuilder(initial = "/portal/pipelines/new") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/portal/pipelines/new" element={<PipelineBuilder />} />
        <Route path="/portal/pipelines/:id" element={<PipelineBuilder />} />
        <Route path="/portal/pipelines" element={<div>pipelines list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PipelineBuilder", () => {
  beforeEach(() => {
    fetchPipeline.mockReset();
    fetchTriggers.mockReset();
    savePipeline.mockReset();
    fetchSources.mockReset();
    fetchTriggers.mockResolvedValue([]);
    fetchSources.mockResolvedValue({ kpis: [], sources: [] });
    savePipeline.mockResolvedValue({});
  });

  it("builds a new pipeline: name it, add a tool, and save", async () => {
    renderBuilder();

    // The name field is the only textbox before the picker opens.
    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Nightly compress" },
    });

    // Open the tool picker and add Compress.
    fireEvent.click(screen.getByRole("button", { name: /addTool/ }));
    fireEvent.click(await screen.findByText("Compress"));

    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nightly compress",
        trigger: null,
        steps: [
          expect.objectContaining({ operation: "/api/v1/misc/compress-pdf" }),
        ],
      }),
    );

    // On success it navigates back to the list.
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });
});
