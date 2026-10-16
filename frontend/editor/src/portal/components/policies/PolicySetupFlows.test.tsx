import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
} from "@portal/api/policies";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  sources: vi.fn(),
  source: vi.fn(),
}));
vi.mock("@portal/api/docparse", () => ({
  fetchDocparseCapabilities: api.capabilities,
}));
vi.mock("@portal/api/sources", async (original) => ({
  ...(await original<typeof import("@portal/api/sources")>()),
  fetchSources: api.sources,
  fetchSource: api.source,
}));
vi.mock("@portal/api/integrations", async (original) => ({
  ...(await original<typeof import("@portal/api/integrations")>()),
  fetchIntegrations: () => Promise.resolve([]),
}));
vi.mock("@portal/api/pipelines", async (original) => ({
  ...(await original<typeof import("@portal/api/pipelines")>()),
  fetchTriggers: () =>
    Promise.resolve([
      { type: "schedule", requiresSource: false, supportedSourceTypes: [] },
    ]),
}));

const category = POLICY_CATEGORIES.find((item) => item.id === "ingestion")!;
const entry: CatalogueEntry = {
  category,
  config: POLICY_CONFIG.ingestion,
  policy: null,
};
const enable = "portal.policies.wizard.actions.enablePolicy";

async function mount(current = entry) {
  const save = vi.fn().mockResolvedValue(undefined);
  const customise = vi.fn();
  render(
    <PolicySetupWizard
      entry={current}
      onClose={vi.fn()}
      onSubmit={save}
      onCustomise={customise}
    />,
    { wrapper: PortalTestProviders },
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Checking ingestion availability..."),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus(),
  );
  return { save, customise };
}
async function select(label: string, option: string) {
  const input = screen.getByRole("textbox", { name: label });
  fireEvent.click(input);
  const list = document.getElementById(input.getAttribute("aria-controls")!);
  fireEvent.click(
    await within(list!).findByRole("option", { name: option, hidden: true }),
  );
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  api.capabilities.mockReset().mockResolvedValue({
    enabled: true,
    engineReachable: true,
    indexingConfigured: false,
  });
  api.sources.mockReset().mockResolvedValue({ sources: [], kpis: [] });
  api.source.mockReset().mockResolvedValue({
    id: "in",
    type: "folder",
    name: "Incoming PDFs",
    enabled: true,
    options: { mode: "track" },
  });
});

describe("guided ingestion flows", () => {
  it("requires a file destination to export without a database", async () => {
    api.sources.mockResolvedValue({
      sources: [
        { id: "in", type: "folder", name: "Incoming PDFs", status: "active" },
        {
          id: "files",
          type: "folder",
          name: "Exported files",
          status: "active",
        },
      ],
      kpis: [],
    });
    const { save } = await mount();
    await select("Input source", "Incoming PDFs");
    await select("Output type", "Export chunks without a database");
    expect(screen.getByRole("button", { name: enable })).toBeDisabled();
    await select("portal.pipelines.composer.output", "Exported files");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: enable }));
    const result = save.mock.calls[0][1];
    expect(result.runsOnEditor).toBe(false);
    expect(result.required).toBe(false);
    expect(result.extraOptions ?? {}).not.toHaveProperty("ragDestination");
    expect(result.outputIds).toEqual(["files"]);
    expect(result.steps.at(-1).parameters).toMatchObject({
      index: false,
      includeOriginal: true,
      exportChunksJsonl: true,
    });
  });

  it.each([
    ["Export chunks without a database", "folder"],
    ["Connected vector database", "vectordb"],
  ])(
    "keeps editor input and requires a destination for %s",
    async (output, type) => {
      api.sources.mockResolvedValue({
        sources: [
          { id: "out", type, name: "Saved destination", status: "active" },
        ],
        kpis: [],
      });
      const { save } = await mount();
      await select("Input source", "Files opened in the editor");
      await select("Output type", output);
      expect(screen.getByRole("textbox", { name: "Delivery" })).toHaveValue(
        "Keep originals and send to a destination",
      );
      expect(
        screen.getByText(/Your editor files stay unchanged/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: enable })).toBeDisabled();
      await select("portal.pipelines.composer.output", "Saved destination");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: enable }));
      expect(save.mock.calls[0][1]).toMatchObject({
        runsOnEditor: true,
        inputs: [],
        outputIds: ["out"],
      });
      expect(save.mock.calls[0][1].steps.at(-1).parameters).toMatchObject({
        index: false,
        exportChunksJsonl: true,
      });
    },
  );

  it("preserves a selected destination when switching the input to editor", async () => {
    api.sources.mockResolvedValue({
      sources: [
        { id: "in", type: "folder", name: "Incoming PDFs", status: "active" },
        {
          id: "out",
          type: "folder",
          name: "Saved destination",
          status: "active",
        },
      ],
      kpis: [],
    });
    const { save } = await mount();
    await select("Input source", "Incoming PDFs");
    await select("Output type", "Export chunks without a database");
    await select("portal.pipelines.composer.output", "Saved destination");
    await select("Input source", "Files opened in the editor");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: enable }));
    expect(save.mock.calls[0][1]).toMatchObject({
      runsOnEditor: true,
      outputIds: ["out"],
    });
  });

  it.each(["exportChunksJsonl", "exportMarkdown"])(
    "requires a destination for a legacy editor policy with %s",
    async (flag) => {
      api.capabilities.mockResolvedValue({
        enabled: true,
        engineReachable: true,
        indexingConfigured: true,
      });
      api.sources.mockResolvedValue({
        sources: [
          { id: "archive", name: "Archive", type: "folder", status: "active" },
        ],
        kpis: [],
      });
      const current: CatalogueEntry = {
        ...entry,
        policy: {
          category,
          config: POLICY_CONFIG.ingestion,
          state: {
            configured: true,
            status: "paused",
            required: false,
            sources: ["editor"],
            scopeTypes: [],
            reviewerEmail: "",
            fieldValues: {},
            runOn: "upload",
            outputMode: "new_version",
            outputName: "",
            outputNamePosition: "suffix",
            maxRetries: 0,
            retryDelayMinutes: 0,
            backendId: "legacy",
            isDefault: false,
            runsOnEditor: true,
            extraOptions: { ragDestination: "builtin" },
          },
          steps: [
            {
              operation: "/api/v1/docparse/ingest",
              parameters: { index: true, [flag]: true },
            },
          ],
          stats: { enforced: 0, dataProcessed: "-", activeFor: "-" },
          activity: [],
        },
      };
      const { save } = await mount(current);
      const saveLabel = "portal.policies.wizard.actions.saveChanges";
      expect(
        await screen.findByText(/Choose an enabled output destination/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: saveLabel })).toBeDisabled();
      await select("portal.pipelines.composer.output", "Archive");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: saveLabel })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: saveLabel }));
      expect(save.mock.calls[0][1].outputIds).toEqual(["archive"]);
      expect(save.mock.calls[0][1].steps.at(-1).parameters).toMatchObject({
        index: true,
        [flag]: true,
      });
    },
  );

  it("saves actual input and database IDs with chunks-only output", async () => {
    api.sources.mockResolvedValue({
      sources: [
        { id: "in", type: "folder", name: "Incoming PDFs", status: "active" },
        {
          id: "out",
          type: "vectordb",
          name: "Research database",
          status: "unused",
        },
      ],
      kpis: [],
    });
    const { save } = await mount();
    await waitFor(() => expect(api.sources).toHaveBeenCalled());
    await select("Input source", "Incoming PDFs");
    await select("Output type", "Connected vector database");
    await select("portal.pipelines.composer.output", "Research database");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: enable }));
    expect(save.mock.calls[0][1]).toMatchObject({
      inputs: [{ sourceId: "in", trigger: null }],
      outputIds: ["out"],
      runsOnEditor: false,
    });
    expect(save.mock.calls[0][1].steps.at(-1).parameters).toMatchObject({
      index: false,
      includeOriginal: false,
      exportMarkdown: false,
      exportChunksJsonl: true,
    });
  });

  it("blocks indexing while the engine is unavailable but permits OCR only", async () => {
    api.capabilities.mockResolvedValue({
      enabled: false,
      engineReachable: false,
    });
    const { save } = await mount();
    await select("Input source", "Files opened in the editor");
    expect(
      await screen.findByText(/engine is disabled or unreachable/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: enable })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("switch", { name: "Prepare for knowledge search" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: enable }));
    expect(save.mock.calls[0][1].steps).toHaveLength(1);
    expect(save.mock.calls[0][1].steps[0].operation).toBe(
      "/api/v1/misc/ocr-pdf",
    );
  });

  it("rechecks readiness after configuration without losing the policy draft", async () => {
    const { save } = await mount();
    await select("Input source", "Files opened in the editor");
    await screen.findByText(
      /built-in knowledge base needs an embedding provider/,
    );
    api.capabilities.mockResolvedValue({
      enabled: true,
      engineReachable: true,
      indexingConfigured: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: enable }));
    expect(save.mock.calls[0][1].steps.at(-1).parameters.index).toBe(true);
    expect(save.mock.calls[0][1].runsOnEditor).toBe(true);
  });

  it("reports failed saves in the open wizard and allows retry", async () => {
    api.capabilities.mockResolvedValue({
      enabled: true,
      engineReachable: true,
      indexingConfigured: true,
    });
    const { save } = await mount();
    save.mockRejectedValueOnce(
      new Error("The selected connection was removed"),
    );
    await select("Input source", "Files opened in the editor");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: enable }));
    expect(
      await screen.findByText("The selected connection was removed"),
    ).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("button", { name: enable })).toBeEnabled();
  });
  it("keeps invalid chunk edits visible and saves corrected values", async () => {
    api.capabilities.mockResolvedValue({
      enabled: true,
      engineReachable: true,
      indexingConfigured: true,
    });
    const { save } = await mount();
    await select("Input source", "Files opened in the editor");
    fireEvent.click(screen.getByRole("button", { name: "Chunk settings" }));
    const overlap = screen.getByRole("spinbutton", {
      name: "portal.pipelines.builder.ingest.overlap",
    });
    fireEvent.change(overlap, { target: { value: "1024" } });
    expect(overlap).toHaveValue(1024);
    expect(screen.getByRole("button", { name: enable })).toBeDisabled();
    fireEvent.change(overlap, { target: { value: "128" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: enable })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: enable }));
    expect(save.mock.calls[0][1].steps.at(-1).parameters.overlap).toBe(128);
  });
  it("reopens the actual database destination despite stale wizard metadata and preserves step settings", async () => {
    api.sources.mockResolvedValue({
      sources: [
        {
          id: "db",
          type: "vectordb",
          name: "Saved database",
          status: "active",
        },
      ],
      kpis: [],
    });
    const current: CatalogueEntry = {
      ...entry,
      policy: {
        category,
        config: POLICY_CONFIG.ingestion,
        state: {
          configured: true,
          status: "paused",
          required: true,
          sources: [],
          scopeTypes: [],
          reviewerEmail: "",
          fieldValues: {},
          runOn: "export",
          outputMode: "new_version",
          outputName: "",
          outputNamePosition: "suffix",
          maxRetries: 0,
          retryDelayMinutes: 0,
          backendId: "edited",
          isDefault: false,
          runsOnEditor: true,
          outputIds: ["db"],
          extraOptions: {
            ragDestination: "builtin",
            editorDelivery: "workspace",
            automation: { name: "keep" },
          },
        },
        steps: [
          {
            operation: "/api/v1/docparse/ingest",
            parameters: {
              index: false,
              includeOriginal: false,
              exportChunksJsonl: true,
              overlap: 0,
              documentId: "pinned-document",
              futureOption: "keep",
            },
            fileParameters: { supportingFile: "saved-asset" },
          },
        ],
        stats: { enforced: 0, dataProcessed: "-", activeFor: "-" },
        activity: [],
      },
    };
    const { save, customise } = await mount(current);
    expect(screen.getByRole("textbox", { name: "Output type" })).toHaveValue(
      "Connected vector database",
    );
    expect(
      screen.queryByRole("switch", { name: "portal.pipelines.enforce.label" }),
    ).not.toBeInTheDocument();
    const saveLabel = "portal.policies.wizard.actions.saveChanges";
    await waitFor(() =>
      expect(screen.getByRole("button", { name: saveLabel })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /customise/i }));
    const draft = customise.mock.calls[0][1];
    expect(draft.required).toBe(false);
    expect(draft.steps[0]).toMatchObject({
      parameters: {
        overlap: 0,
        documentId: "pinned-document",
        futureOption: "keep",
      },
      fileParameters: { supportingFile: "saved-asset" },
    });
    fireEvent.click(screen.getByRole("button", { name: saveLabel }));
    expect(save.mock.calls[0][1]).toMatchObject({
      outputIds: ["db"],
      required: false,
      runOn: "export",
      steps: draft.steps,
    });
  });
});
