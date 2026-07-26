import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Policy, TriggerOutcome } from "@portal/api/pipelines";
import type { ToolRegistryCatalog } from "@app/contexts/ToolRegistryContext";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";

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

const clearProcessedHistory = vi.fn();
vi.mock("@portal/api/policies", () => ({
  clearProcessedHistory: (id: string) => clearProcessedHistory(id),
}));

const fetchS3Connections = vi.fn();
const createIntegration = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => fetchS3Connections(),
  // Custom-API authoring is a server decision; these tests assert the default view.
  fetchIntegrationCapabilities: () => Promise.resolve({ customApi: false }),
  fetchS3Connections: () => fetchS3Connections(),
  createIntegration: (...args: unknown[]) => createIntegration(...args),
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

function outcome(overrides: Partial<TriggerOutcome>): TriggerOutcome {
  return {
    runIds: [],
    filesListed: 0,
    alreadyProcessed: 0,
    parked: 0,
    inFlight: 0,
    ...overrides,
  };
}

function renderBuilder(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/processor/pipelines/new" element={<PipelineBuilder />} />
        <Route path="/processor/pipelines/:id" element={<PipelineBuilder />} />
        <Route
          path="/processor/pipelines"
          element={<div>pipelines list</div>}
        />
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
    triggerPipeline.mockResolvedValue(outcome({ runIds: ["run-1"] }));
    fetchRun.mockResolvedValue({ status: "COMPLETED" });
    clearProcessedHistory.mockReset();
    clearProcessedHistory.mockResolvedValue(undefined);
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
    createIntegration.mockReset();
  });

  it("builds a new pipeline: name it, add a tool, and save", async () => {
    renderBuilder("/processor/pipelines/new");

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

  it("saves an s3 output referencing an inline-created connection", async () => {
    createIntegration.mockResolvedValue({ id: 12, name: "Claims bucket" });
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Bucket to bucket" },
    });
    fireEvent.click(screen.getByLabelText("portal.pipelines.output.s3"));

    // With s3 selected but no connection chosen, saving is blocked. The
    // connection picker + prefix are inline (no modal), like the folder output.
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).toBeDisabled();

    // No connections exist: create one inline from the picker. Target fields by
    // label, not position - the picker's Mantine Select also carries an input
    // role and would shift index-based queries.
    fireEvent.click(
      await screen.findByText("portal.connections.picker.createNew"),
    );
    fireEvent.change(screen.getByLabelText(/portal\.integrations\.typedName/), {
      target: { value: "Claims bucket" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /portal\.connections\.types\.s3\.fields\.bucket\.label/,
      ),
      { target: { value: "claims-processed" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.connections\.types\.s3\.fields\.accessKeyId\.label/,
      ),
      { target: { value: "AKIAEXAMPLE" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.connections\.types\.s3\.fields\.secretAccessKey\.label/,
      ),
      { target: { value: "shh-secret" } },
    );
    fireEvent.click(screen.getByText("portal.connections.picker.save"));
    await waitFor(() => expect(createIntegration).toHaveBeenCalledTimes(1));
    // The connection modal closes once saved and the connection is selected.
    await waitFor(() =>
      expect(
        screen.queryByText("portal.connections.picker.save"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.s3\.fields\.prefix\.label/,
      ),
      { target: { value: "processed/" } },
    );
    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        output: {
          type: "s3",
          options: {
            connectionId: "12",
            prefix: "processed/",
          },
        },
      }),
    );
  });

  it("runs an existing pipeline and reports success", async () => {
    renderBuilder("/processor/pipelines/plc-1");

    fireEvent.click(await screen.findByText("portal.pipelines.detail.run"));

    await waitFor(() => expect(triggerPipeline).toHaveBeenCalledWith("plc-1"));
    expect(
      await screen.findByText("portal.pipelines.run.completed"),
    ).toBeInTheDocument();
  });

  it("explains an empty trigger when files are parked by a failed run", async () => {
    triggerPipeline.mockResolvedValue(outcome({ filesListed: 2, parked: 2 }));
    renderBuilder("/processor/pipelines/plc-1");

    fireEvent.click(await screen.findByText("portal.pipelines.detail.run"));

    expect(
      await screen.findByText("portal.pipelines.run.parked"),
    ).toBeInTheDocument();
  });

  it("explains an empty trigger when everything is already processed", async () => {
    triggerPipeline.mockResolvedValue(
      outcome({ filesListed: 3, alreadyProcessed: 3 }),
    );
    renderBuilder("/processor/pipelines/plc-1");

    fireEvent.click(await screen.findByText("portal.pipelines.detail.run"));

    expect(
      await screen.findByText("portal.pipelines.run.allProcessed"),
    ).toBeInTheDocument();
  });

  it("clears processed history from the header and confirms", async () => {
    renderBuilder("/processor/pipelines/plc-1");

    fireEvent.click(
      await screen.findByText("portal.pipelines.detail.clearHistory"),
    );

    await waitFor(() =>
      expect(clearProcessedHistory).toHaveBeenCalledWith("plc-1"),
    );
    expect(
      await screen.findByText("portal.pipelines.run.historyCleared"),
    ).toBeInTheDocument();
  });

  it("blocks saving a step that needs an uploaded file", async () => {
    renderBuilder("/processor/pipelines/new");

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

  it("blocks saving an integration step with no account chosen", async () => {
    // A Discord step added but left without an account would fail at run time with a raw backend
    // rejection; the builder must refuse to save it and say why, where the fix is one click away.
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Notify only" },
    });
    fireEvent.click(screen.getByRole("button", { name: /addTool/ }));
    fireEvent.click(
      await screen.findByText("portal.policies.operations.discordNotify.label"),
    );

    // Operation chosen, account not: still not saveable.
    expect(
      await screen.findByText("portal.pipelines.builder.stepsNeedSetup"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).toBeDisabled();
  });

  it("deletes an existing pipeline after confirmation", async () => {
    renderBuilder("/processor/pipelines/plc-1");

    fireEvent.click(await screen.findByText("portal.pipelines.detail.delete"));
    fireEvent.click(await screen.findByText("portal.pipelines.delete.confirm"));

    await waitFor(() => expect(deletePipeline).toHaveBeenCalledWith("plc-1"));
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });

  it("prompts to save or discard when leaving with unsaved edits", async () => {
    renderBuilder("/processor/pipelines/new");

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

  it("keeps the account chosen for an integration step", async () => {
    // The regression: integration steps are deliberately toolId-less, and the builder's param
    // update used to skip exactly those, so picking an account looked like it did nothing.
    fetchS3Connections.mockResolvedValue([
      {
        id: 9,
        name: "Ops alerts",
        integrationType: "API",
        config: { presetId: "discord" },
      },
    ]);
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Notify on processed" },
    });

    fireEvent.click(screen.getByRole("button", { name: /addTool/ }));
    fireEvent.click(
      await screen.findByText("portal.policies.operations.discordNotify.label"),
    );

    fireEvent.click(
      await screen.findByPlaceholderText(
        "portal.connections.picker.placeholder",
      ),
    );
    fireEvent.click(await screen.findByText("Ops alerts"));

    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    const saved = savePipeline.mock.calls[0][0] as Policy;
    const step = saved.steps[0] as unknown as {
      operation: string;
      parameters: Record<string, string>;
    };
    expect(step.operation).toBe("/api/v1/integration/external-api-call");
    // The selection survived all the way to the wire, not just to the dropdown.
    expect(step.parameters.connectionId).toBe("9");
    expect(step.parameters.operationId).toBe("discordNotify");
  });

  it("leaves immediately when there are no unsaved edits", async () => {
    renderBuilder("/processor/pipelines/new");

    await screen.findByRole("textbox");
    fireEvent.click(screen.getByText("portal.pipelines.composer.cancel"));

    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });
});
