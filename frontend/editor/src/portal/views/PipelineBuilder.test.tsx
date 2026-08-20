import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import type { Policy, TriggerOutcome } from "@portal/api/pipelines";
import type { SourceView } from "@portal/api/sources";
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

const uploadPipelineAsset = vi.fn();
const listPipelineAssets = vi.fn();
vi.mock("@portal/api/pipelineAssets", () => ({
  uploadPipelineAsset: (file: File) => uploadPipelineAsset(file),
  listPipelineAssets: () => listPipelineAssets(),
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

// The destination picker just selects saved sources; stub its three affordances
// (pick, create, edit) to buttons, keeping this suite focused on the builder.
vi.mock("@portal/components/pipelines/DestinationPicker", () => ({
  DestinationPicker: ({
    value,
    onChange,
    onCreateNew,
    onEdit,
  }: {
    value: string[];
    onChange: (ids: string[]) => void;
    onCreateNew: () => void;
    onEdit: (sourceId: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => onChange(["src-1"])}>
        {value.length > 0 ? `output:${value.join(",")}` : "pick output"}
      </button>
      <button type="button" onClick={onCreateNew}>
        new destination
      </button>
      <button type="button" onClick={() => onEdit(value[0] ?? "")}>
        edit destination
      </button>
    </>
  ),
}));

// The source modal has its own suite; stub it to the two things the builder
// depends on - the record it was opened on, and the sources-cache invalidation
// that follows a save (which is how a new source reaches the pickers).
vi.mock("@portal/components/sources/SourceModal", () => ({
  SourceModal: ({
    open,
    sourceId,
  }: {
    open: boolean;
    sourceId?: string | null;
  }) => {
    const queryClient = useQueryClient();
    if (!open) return null;
    return (
      <div>
        <span>source-modal:{sourceId || "new"}</span>
        <button
          type="button"
          onClick={() =>
            void queryClient.invalidateQueries({ queryKey: qk.sources() })
          }
        >
          source saved
        </button>
      </div>
    );
  },
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
      // Sends the supporting file under a named field, like a real file tool, so the upload path
      // has a field to bind. The scalar mapper drops the File (files never ride in parameters).
      buildFormData: (params: Record<string, unknown>, file: File | File[]) => {
        const fd = new FormData();
        fd.append("fileInput", Array.isArray(file) ? file[0] : file);
        if (params.watermarkImage instanceof File) {
          fd.append("watermarkImage", params.watermarkImage);
        }
        return fd;
      },
      toApiParams: (params: Record<string, unknown>) => {
        const scalars = { ...params };
        delete scalars.watermarkImage;
        return scalars;
      },
      fromApiParams: (params: Record<string, unknown>) => ({ ...params }),
    },
  } as unknown as ToolRegistryEntry;
  // Produces images, so nothing downstream that wants a PDF can follow it.
  const extractImages = {
    name: "Extract images",
    icon: null,
    component: null,
    description: "",
    categoryId: "recommendedTools",
    subcategoryId: "general",
    operationConfig: {
      operationType: "extractImages",
      toolType: 0,
      endpoint: "/api/v1/misc/extract-images",
      defaultParameters: {},
      buildFormData: () => new FormData(),
      toApiParams: (params: Record<string, unknown>) => ({ ...params }),
      fromApiParams: (params: Record<string, unknown>) => ({ ...params }),
    },
  } as unknown as ToolRegistryEntry;
  // A tool that will not run on its defaults: its validateParams is the same predicate its own Run
  // button uses, so a step for it is "unconfigured" until a language is chosen.
  const ocr = {
    name: "OCR",
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
        onClick={() => props.onParameterChange("languages", ["eng"])}
      >
        pick language
      </button>
    ),
    operationConfig: {
      operationType: "ocr",
      toolType: 0,
      endpoint: "/api/v1/misc/ocr-pdf",
      defaultParameters: { languages: [] },
      validateParams: (params: { languages?: string[] }) =>
        (params.languages ?? []).length > 0,
      buildFormData: () => new FormData(),
      toApiParams: (params: Record<string, unknown>) => ({ ...params }),
      fromApiParams: (params: Record<string, unknown>) => ({ ...params }),
    },
  } as unknown as ToolRegistryEntry;
  // A tool whose buildFormData throws, so it can't be probed: exercises the "activeFileFields is
  // null" path where a reopened step's stored binding must be kept, not dropped.
  const sign = {
    name: "Sign",
    icon: null,
    component: null,
    description: "",
    categoryId: "recommendedTools",
    subcategoryId: "general",
    operationConfig: {
      operationType: "certSign",
      toolType: 0,
      endpoint: "/api/v1/security/cert-sign",
      defaultParameters: {},
      buildFormData: () => {
        throw new Error("cannot build");
      },
      toApiParams: (params: Record<string, unknown>) => ({ ...params }),
      fromApiParams: (params: Record<string, unknown>) => ({ ...params }),
    },
  } as unknown as ToolRegistryEntry;
  const allTools = {
    compress,
    extractImages,
    ocr,
    sign,
  } as unknown as ToolRegistryCatalog["allTools"];
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
  inputs: [],
  steps: [],
  output: { type: "inline", options: {} },
  outputIds: [],
};

/** The built-in editor source, offered as an input so a pipeline can run in the browser. */
const EDITOR_SOURCE: SourceView = {
  id: "src-editor",
  name: "Editor",
  type: "editor",
  status: "active",
  referenceCount: 0,
  referencingPolicies: [],
  config: [],
  docsTotal: 0,
  docs24h: 0,
  docs30d: 0,
};

const SOURCE: SourceView = {
  id: "src-in",
  name: "Claims intake",
  type: "folder",
  status: "active",
  referenceCount: 0,
  referencingPolicies: [],
  config: [],
  docsTotal: 0,
  docs24h: 0,
  docs30d: 0,
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
    fetchSources.mockResolvedValue({ kpis: [], sources: [SOURCE] });
    savePipeline.mockResolvedValue({});
    deletePipeline.mockResolvedValue(undefined);
    triggerPipeline.mockResolvedValue(outcome({ runIds: ["run-1"] }));
    fetchRun.mockResolvedValue({ status: "COMPLETED" });
    clearProcessedHistory.mockReset();
    clearProcessedHistory.mockResolvedValue(undefined);
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
    createIntegration.mockReset();
    uploadPipelineAsset.mockReset();
    uploadPipelineAsset.mockResolvedValue({
      id: "ast-1",
      fileName: "logo.png",
      contentType: "image/png",
      size: 1,
      createdAt: 0,
    });
    listPipelineAssets.mockReset();
    listPipelineAssets.mockResolvedValue([]);
  });

  // The settings of a node are reached by selecting it in the graph, so every helper below opens
  // its node first. Nodes are found by position rather than by label, because a node's title is
  // its current value - it changes as the pipeline is filled in.

  /** The graph's selectable nodes, in chain order: input, each step, output. */
  function graphNodes(): HTMLElement[] {
    return screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));
  }

  /**
   * The control that opens an end of the chain, once the graph has rendered. A new pipeline has not
   * placed its ends yet, so that control is the "add" placeholder and clicking it both puts the node
   * on the chain and selects it; a loaded pipeline already has the node, so it is a plain select.
   */
  function endOpener(end: "input" | "output"): Promise<HTMLElement> {
    return waitFor(() => {
      const placeholder = screen.queryByText(
        `portal.pipelines.graph.add.${end}`,
      );
      if (placeholder) return placeholder;
      const nodes = graphNodes();
      if (nodes.length === 0) throw new Error("the graph has not rendered yet");
      return end === "input" ? nodes[0] : nodes[nodes.length - 1];
    });
  }

  async function openInput() {
    fireEvent.click(await endOpener("input"));
  }

  async function openOutput() {
    fireEvent.click(await endOpener("output"));
  }

  async function pickInputSource(sourceName: string) {
    await openInput();
    fireEvent.click(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.builder.inputSource",
      }),
    );
    fireEvent.click(await screen.findByText(sourceName));
  }

  /**
   * Add a tool. An empty chain offers the placeholder; once it has steps, the wires carry the
   * inserts instead.
   */
  async function addTool(toolName: string) {
    const placeholder = screen.queryByText(
      "portal.pipelines.graph.addFirstTool",
    );
    if (placeholder) {
      fireEvent.click(placeholder);
    } else {
      // The LAST wire, so repeated calls append. Taking the first would insert each new tool ahead
      // of the ones already there, silently reversing the order a caller asked for.
      const inserts = screen.getAllByLabelText(
        "portal.pipelines.graph.insertHere",
      );
      fireEvent.click(inserts[inserts.length - 1]);
    }
    fireEvent.click(await screen.findByText(toolName));
  }

  async function pickDestination() {
    await openOutput();
    fireEvent.click(await screen.findByText("pick output"));
  }

  /** Open the header's overflow tray. */
  async function openTray() {
    fireEvent.click(
      await screen.findByLabelText("portal.pipelines.builder.moreActions"),
    );
  }

  it("greets a new pipeline with places to fill, not problems to fix", async () => {
    renderBuilder("/processor/pipelines/new");

    // Both ends offer to be added rather than complaining about being empty: the user has not been
    // asked for a source or a destination yet, so there is nothing yet to warn them about.
    expect(
      await screen.findByText("portal.pipelines.graph.add.input"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.graph.add.output"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.builder.needsSource"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.builder.needsDestination"),
    ).not.toBeInTheDocument();
    // Nothing is on the chain, so there is nothing to remove either.
    expect(
      screen.queryByLabelText(/portal.pipelines.graph.removeNode/),
    ).not.toBeInTheDocument();
  });

  it("warns on a step whose tool cannot run on its defaults", async () => {
    renderBuilder("/processor/pipelines/new");
    await addTool("OCR");

    // The tool declares its own mandatory parameters, so the node says so without the builder
    // knowing anything about OCR.
    expect(
      await screen.findByText("portal.pipelines.builder.needsConfiguring"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).toBeDisabled();
  });

  it("stays quiet on the wires around a step that still needs setting up", async () => {
    renderBuilder("/processor/pipelines/new");
    await addTool("OCR");

    // The node itself flags that it needs setting up...
    await screen.findByText("portal.pipelines.builder.needsConfiguring");
    // ...but the wires around it don't nag: an unconfigured step's operation is unknown, so neither
    // the wire into it nor the one out of it shows a compatibility warning until it is configured.
    expect(
      screen.queryByText(
        "portal.pipelines.builder.diagnostic.undeclared-operation",
      ),
    ).not.toBeInTheDocument();
  });

  it("clears the warning once the step is configured", async () => {
    renderBuilder("/processor/pipelines/new");
    await addTool("OCR");
    await screen.findByText("portal.pipelines.builder.needsConfiguring");

    // Adding a step selects it, so its settings are already open.
    fireEvent.click(screen.getByText("pick language"));

    await waitFor(() =>
      expect(
        screen.queryByText("portal.pipelines.builder.needsConfiguring"),
      ).not.toBeInTheDocument(),
    );
  });

  it("leaves a tool that runs happily on its defaults unwarned", async () => {
    renderBuilder("/processor/pipelines/new");
    await addTool("Compress");

    expect(
      await screen.findByText("portal.pipelines.graph.add.input"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.builder.needsConfiguring"),
    ).not.toBeInTheDocument();
  });

  it("only asks for a source once the user has asked for the node", async () => {
    renderBuilder("/processor/pipelines/new");
    await openInput();

    // Placing the node is what turns it into an outstanding choice.
    expect(
      await screen.findByText("portal.pipelines.builder.needsSource"),
    ).toBeInTheDocument();
    // Still nothing chosen, so the pipeline cannot be created.
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).toBeDisabled();
  });

  it("puts an end back to a placeholder when it is removed", async () => {
    renderBuilder("/processor/pipelines/new");
    await openInput();
    await screen.findByText("portal.pipelines.builder.needsSource");

    fireEvent.click(screen.getByLabelText("portal.pipelines.graph.removeNode"));

    expect(
      await screen.findByText("portal.pipelines.graph.add.input"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.builder.needsSource"),
    ).not.toBeInTheDocument();
  });

  it("edits a node's settings only once it is selected", async () => {
    renderBuilder("/processor/pipelines/new");
    await screen.findByText("portal.pipelines.graph.add.input");

    // Nothing selected: the inspector says so rather than showing a form.
    expect(
      screen.getByText("portal.pipelines.inspector.noSelectionTitle"),
    ).toBeInTheDocument();

    await openInput();
    expect(
      screen.getByRole("textbox", {
        name: "portal.pipelines.builder.inputSource",
      }),
    ).toBeInTheDocument();
  });

  it("builds a new pipeline: name it, add a tool, an input, a destination, and save", async () => {
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      {
        target: { value: "Nightly compress" },
      },
    );

    await addTool("Compress");

    // A pipeline must have at least one input source and one output destination.
    await pickInputSource("Claims intake");
    await pickDestination();

    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nightly compress",
        // The input pairs the chosen source with its trigger (manual by default).
        inputs: [{ sourceId: "src-in", trigger: null }],
        outputIds: ["src-1"],
        steps: [
          expect.objectContaining({ operation: "/api/v1/misc/compress-pdf" }),
        ],
      }),
    );
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });

  it("blocks saving a chain whose steps can't run on each other", async () => {
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      { target: { value: "Broken chain" } },
    );
    await pickInputSource("Claims intake");
    await pickDestination();

    // Extract images emits images; compress only takes a PDF, so it can never run.
    await addTool("Extract images");
    await addTool("Compress");

    expect(
      await screen.findByText("portal.pipelines.builder.stepsIncompatible"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).toBeDisabled();
  });

  it("says why on the wire arriving at the step that cannot run", async () => {
    renderBuilder("/processor/pipelines/new");
    await pickInputSource("Claims intake");
    await pickDestination();

    await addTool("Extract images");
    await addTool("Compress");

    // The banner names which steps are at fault; the wire explains what is wrong where it happens.
    const note = await screen.findByText(
      /portal\.pipelines\.builder\.diagnostic\./,
    );
    expect(note.closest(".portal-graph-edge")).toHaveClass("is-blocking");
  });

  it("allows a chain whose steps line up", async () => {
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      { target: { value: "Fine chain" } },
    );
    await pickInputSource("Claims intake");
    await pickDestination();

    await addTool("Compress");

    expect(
      screen.queryByText("portal.pipelines.builder.stepsIncompatible"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).not.toBeDisabled();
  });

  it("requires at least one source and one destination before saving", async () => {
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      {
        target: { value: "Needs both" },
      },
    );
    const createButton = () =>
      screen.getByText("portal.pipelines.composer.create").closest("button");

    // Name only: blocked (no source, no destination).
    expect(createButton()).toBeDisabled();

    // An input with a source but still no destination: blocked.
    await pickInputSource("Claims intake");
    expect(createButton()).toBeDisabled();

    // Both chosen: allowed, and both are sent.
    await pickDestination();
    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));
    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [{ sourceId: "src-in", trigger: null }],
        outputIds: ["src-1"],
      }),
    );
  });

  it("creates and edits sources in place through the modal", async () => {
    renderBuilder("/processor/pipelines/new");
    await pickInputSource("Claims intake");

    // Connect source opens the modal in create mode, without leaving the
    // builder (and its unsaved edits) for the Sources page.
    fireEvent.click(screen.getByText("portal.sources.actions.connectSource"));
    expect(screen.getByText("source-modal:new")).toBeInTheDocument();
    expect(screen.queryByText("pipelines list")).not.toBeInTheDocument();

    // The pencil beside the input opens the same modal on the chosen source.
    fireEvent.click(
      screen.getByLabelText("portal.pipelines.composer.editSource"),
    );
    expect(screen.getByText("source-modal:src-in")).toBeInTheDocument();
  });

  it("cannot edit an input source before one is chosen", async () => {
    renderBuilder("/processor/pipelines/new");
    await openInput();

    expect(
      screen.getByLabelText("portal.pipelines.composer.editSource"),
    ).toBeDisabled();
    await pickInputSource("Claims intake");
    expect(
      screen.getByLabelText("portal.pipelines.composer.editSource"),
    ).not.toBeDisabled();
  });

  it("makes a source created from the input row the pipeline's input", async () => {
    fetchSources
      .mockResolvedValueOnce({ kpis: [], sources: [SOURCE] })
      .mockResolvedValue({
        kpis: [],
        sources: [SOURCE, { ...SOURCE, id: "src-new", name: "Scanner drop" }],
      });
    renderBuilder("/processor/pipelines/new");
    await openInput();

    fireEvent.click(screen.getByText("portal.sources.actions.connectSource"));
    fireEvent.click(screen.getByText("source saved"));

    // The new source is the one the pipeline was missing, so it becomes the input.
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", {
          name: "portal.pipelines.builder.inputSource",
        }),
      ).toHaveValue("Scanner drop"),
    );
  });

  it("makes a destination created from the picker the pipeline's output", async () => {
    fetchSources
      .mockResolvedValueOnce({ kpis: [], sources: [SOURCE] })
      .mockResolvedValue({
        kpis: [],
        sources: [
          SOURCE,
          { ...SOURCE, id: "src-new", name: "Archive bucket", type: "s3" },
        ],
      });
    renderBuilder("/processor/pipelines/new");
    await openInput();
    openOutput();
    await screen.findByText("pick output");

    fireEvent.click(screen.getByText("new destination"));
    fireEvent.click(screen.getByText("source saved"));

    // Created from the destination picker, so it lands in the output rather
    // than the input.
    await waitFor(() =>
      expect(screen.getByText("output:src-new")).toBeInTheDocument(),
    );
    // The input was left alone: its node still shows the prompt.
    expect(
      screen.getByText("portal.pipelines.builder.chooseSource"),
    ).toBeInTheDocument();
  });

  it("leaves a new source that cannot be written to out of the destination", async () => {
    // A webhook can be read from but not written to, so it must not be picked
    // as a destination the dropdown has no option for.
    fetchSources
      .mockResolvedValueOnce({ kpis: [], sources: [SOURCE] })
      .mockResolvedValue({
        kpis: [],
        sources: [
          SOURCE,
          { ...SOURCE, id: "src-hook", name: "Partner hook", type: "webhook" },
        ],
      });
    renderBuilder("/processor/pipelines/new");
    await openInput();
    openOutput();
    await screen.findByText("pick output");

    fireEvent.click(screen.getByText("new destination"));
    fireEvent.click(screen.getByText("source saved"));

    // It was not made the destination...
    await waitFor(() => expect(fetchSources).toHaveBeenCalledTimes(2));
    expect(screen.getByText("pick output")).toBeInTheDocument();

    // ...but it did arrive, and is offered as an input, where a webhook makes sense.
    await openInput();
    fireEvent.click(
      screen.getByRole("textbox", {
        name: "portal.pipelines.builder.inputSource",
      }),
    );
    expect(await screen.findByText("Partner hook")).toBeInTheDocument();
  });

  it("edits the chosen destination through the same modal", async () => {
    renderBuilder("/processor/pipelines/new");
    await pickDestination();

    fireEvent.click(screen.getByText("edit destination"));
    expect(screen.getByText("source-modal:src-1")).toBeInTheDocument();
  });

  it("saves an editor pipeline as run-on-upload metadata, not as a wire input", async () => {
    fetchSources.mockResolvedValue({
      kpis: [],
      sources: [SOURCE, EDITOR_SOURCE],
    });
    renderBuilder("/processor/pipelines/new");
    fireEvent.change(
      await screen.findByLabelText("portal.pipelines.composer.name"),
      { target: { value: "Label on upload" } },
    );
    await addTool("Compress");
    await pickInputSource("Editor");

    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    const body = savePipeline.mock.calls[0][0];
    // The editor is virtual: nothing sweeps it server-side, so it is recorded in the options the
    // editor reads rather than as an input the backend would try to pull from.
    expect(body.inputs).toEqual([]);
    expect(body.output.options.sources).toEqual(["editor"]);
    expect(body.output.options.runOn).toBe("upload");
    // And it needs no destination - results land back in the workspace the file came from.
    expect(body.outputIds).toEqual([]);
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

  it("reprocesses the source: clears the processed record, runs, and reports", async () => {
    renderBuilder("/processor/pipelines/plc-1");

    await openTray();
    fireEvent.click(screen.getByText("portal.pipelines.detail.clearHistory"));

    // It forgets what was processed, then triggers a run so those files go through now.
    await waitFor(() =>
      expect(clearProcessedHistory).toHaveBeenCalledWith("plc-1"),
    );
    await waitFor(() => expect(triggerPipeline).toHaveBeenCalledWith("plc-1"));
    expect(
      await screen.findByText("portal.pipelines.run.completed"),
    ).toBeInTheDocument();
  });

  it("uploads a step's supporting file and saves it as an asset binding", async () => {
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      {
        target: { value: "Watermarked" },
      },
    );
    await addTool("Compress");
    // The tool's settings attach a supporting file.
    fireEvent.click(await screen.findByText("upload logo"));

    await pickInputSource("Claims intake");
    await pickDestination();

    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));

    // The file is uploaded to the asset store first, then the policy is saved binding that asset.
    await waitFor(() => expect(uploadPipelineAsset).toHaveBeenCalledTimes(1));
    expect(uploadPipelineAsset.mock.calls[0][0]).toBeInstanceOf(File);
    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            operation: "/api/v1/misc/compress-pdf",
            fileParameters: { watermarkImage: "asset:ast-1" },
          }),
        ],
      }),
    );
  });

  it("keeps a step's stored file binding on save when the tool can't be probed", async () => {
    // buildFormData throws for `sign`, so activeFileFields is null. The stored binding must survive
    // the save unchanged - dropping it would let the server GC the user's uploaded file - and no
    // re-upload should happen.
    fetchPipeline.mockResolvedValue({
      id: "plc-sign",
      name: "Signed",
      enabled: true,
      inputs: [{ sourceId: "src-in", trigger: null }],
      steps: [
        {
          operation: "/api/v1/security/cert-sign",
          parameters: {},
          fileParameters: { certFile: "asset:x" },
        },
      ],
      output: { type: "inline", options: {} },
      outputIds: ["src-1"],
    });
    renderBuilder("/processor/pipelines/plc-sign");

    fireEvent.click(await screen.findByText("portal.pipelines.composer.save"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            operation: "/api/v1/security/cert-sign",
            fileParameters: { certFile: "asset:x" },
          }),
        ],
      }),
    );
    expect(uploadPipelineAsset).not.toHaveBeenCalled();
  });

  it("blocks saving an integration step with no account chosen", async () => {
    // A Discord step added but left without an account would fail at run time with a raw backend
    // rejection; the builder must refuse to save it and say why, where the fix is one click away.
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      {
        target: { value: "Notify only" },
      },
    );
    await addTool("portal.policies.operations.discordNotify.label");

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

    // Delete is a rare, destructive action, so it lives behind the overflow tray.
    await openTray();
    fireEvent.click(await screen.findByText("portal.pipelines.detail.delete"));
    fireEvent.click(await screen.findByText("portal.pipelines.delete.confirm"));

    await waitFor(() => expect(deletePipeline).toHaveBeenCalledWith("plc-1"));
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });

  it("pauses a live pipeline at once, in place, and re-saves the persisted policy", async () => {
    renderBuilder("/processor/pipelines/plc-1");

    // POLICY.enabled is true, so the toggle offers to pause it.
    fireEvent.click(await screen.findByText("portal.pipelines.builder.pause"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plc-1", enabled: false }),
    );
    // It acts in place: the builder stays open and the control now offers to activate again.
    expect(
      await screen.findByText("portal.pipelines.builder.activate"),
    ).toBeInTheDocument();
    expect(screen.queryByText("pipelines list")).not.toBeInTheDocument();
  });

  it("creates a paused pipeline when Create paused is chosen", async () => {
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      { target: { value: "Paused draft" } },
    );
    await addTool("Compress");
    await pickInputSource("Claims intake");
    await pickDestination();

    fireEvent.click(screen.getByText("portal.pipelines.composer.createPaused"));

    await waitFor(() => expect(savePipeline).toHaveBeenCalledTimes(1));
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Paused draft", enabled: false }),
    );
    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });

  it("prompts to save or discard when leaving with unsaved edits", async () => {
    renderBuilder("/processor/pipelines/new");

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      {
        target: { value: "Draft" },
      },
    );
    fireEvent.click(screen.getByLabelText("portal.pipelines.builder.back"));

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

    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "portal.pipelines.composer.name",
      }),
      {
        target: { value: "Notify on processed" },
      },
    );

    await addTool("portal.policies.operations.discordNotify.label");

    fireEvent.click(
      await screen.findByPlaceholderText(
        "portal.connections.picker.placeholder",
      ),
    );
    fireEvent.click(await screen.findByText("Ops alerts"));

    // Saving needs the input's source and a destination.
    await pickInputSource("Claims intake");
    await pickDestination();

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

    await screen.findByRole("textbox", {
      name: "portal.pipelines.composer.name",
    });
    fireEvent.click(screen.getByLabelText("portal.pipelines.builder.back"));

    expect(await screen.findByText("pipelines list")).toBeInTheDocument();
  });
});
