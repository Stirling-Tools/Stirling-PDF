import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Policy } from "@portal/api/pipelines";
import type { ToolRegistryCatalog } from "@app/contexts/ToolRegistryContext";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";

const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) => baseRender(ui, { wrapper: MantineProvider, ...options });

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
const deletePipeline = vi.fn();
const triggerPipeline = vi.fn();
const fetchRun = vi.fn();
vi.mock("@portal/api/pipelines", () => ({
  fetchPipeline: (id: string) => fetchPipeline(id),
  fetchTriggers: () => fetchTriggers(),
  savePipeline: (policy: unknown) => savePipeline(policy),
  deletePipeline: (id: string) => deletePipeline(id),
  triggerPipeline: (id: string) => triggerPipeline(id),
  fetchRun: (runId: string) => fetchRun(runId),
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
    automationSettings: (props: {
      onParameterChange: (key: string, value: unknown) => void;
    }) => (
      <button
        type="button"
        onClick={() =>
          props.onParameterChange(
            "watermarkImage",
            new File(["x"], "logo.png", { type: "image/png" }),
          )
        }
      >
        upload logo
      </button>
    ),
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

const POLICY: Policy = {
  id: "plc-1",
  name: "Existing pipeline",
  enabled: true,
  trigger: null,
  sourceIds: [],
  steps: [],
  output: { type: "inline", options: {} },
};

function renderBuilder(initial: string) {
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
    deletePipeline.mockReset();
    triggerPipeline.mockReset();
    fetchRun.mockReset();
    fetchSources.mockReset();
    fetchPipeline.mockResolvedValue(POLICY);
    fetchTriggers.mockResolvedValue([]);
    fetchSources.mockResolvedValue({ kpis: [], sources: [] });
    savePipeline.mockResolvedValue({});
    deletePipeline.mockResolvedValue(undefined);
    triggerPipeline.mockResolvedValue(["run-1"]);
    fetchRun.mockResolvedValue({ status: "COMPLETED" });
  });

  it("builds a new pipeline: name it, add a tool, and save", async () => {
    renderBuilder("/portal/pipelines/new");

    // The name field is the only textbox before the picker opens.
    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Nightly compress" },
    });

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
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });

  it("runs an existing pipeline and reports success", async () => {
    renderBuilder("/portal/pipelines/plc-1");

    fireEvent.click(await screen.findByText("portal.pipelines.detail.run"));

    await waitFor(() => expect(triggerPipeline).toHaveBeenCalledWith("plc-1"));
    expect(
      await screen.findByText("portal.pipelines.run.completed"),
    ).toBeInTheDocument();
  });

  it("blocks saving a step that needs an uploaded file", async () => {
    renderBuilder("/portal/pipelines/new");

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Watermarked" },
    });
    fireEvent.click(screen.getByRole("button", { name: /addTool/ }));
    fireEvent.click(await screen.findByText("Compress"));
    // The tool's settings upload a file, which a stored pipeline can't persist yet.
    fireEvent.click(await screen.findByText("upload logo"));

    expect(
      await screen.findByText("portal.pipelines.builder.uploadUnsupported"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).toBeDisabled();
  });

  it("deletes an existing pipeline after confirmation", async () => {
    renderBuilder("/portal/pipelines/plc-1");

    fireEvent.click(await screen.findByText("portal.pipelines.detail.delete"));
    fireEvent.click(await screen.findByText("portal.pipelines.delete.confirm"));

    await waitFor(() => expect(deletePipeline).toHaveBeenCalledWith("plc-1"));
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });

  it("prompts to save or discard when leaving with unsaved edits", async () => {
    renderBuilder("/portal/pipelines/new");

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Draft" },
    });
    fireEvent.click(screen.getByText("portal.pipelines.composer.cancel"));

    expect(
      await screen.findByText("portal.pipelines.builder.unsavedTitle"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("portal.pipelines.builder.discard"));
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });

  it("leaves immediately when there are no unsaved edits", async () => {
    renderBuilder("/portal/pipelines/new");

    await screen.findByRole("textbox");
    fireEvent.click(screen.getByText("portal.pipelines.composer.cancel"));

    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });
});
