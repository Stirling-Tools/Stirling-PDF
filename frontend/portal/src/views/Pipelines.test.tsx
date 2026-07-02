import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HttpError } from "@portal/api/http";
import type { PipelinesOverviewResponse, Policy } from "@portal/api/pipelines";
import type { SourcesResponse } from "@portal/api/sources";
import { Pipelines } from "@portal/views/Pipelines";

// Deterministic i18n: keys returned verbatim, so assertions are stable without
// the async TOML backend.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchPipelines = vi.fn();
const fetchPipeline = vi.fn();
const savePipeline = vi.fn();
const deletePipeline = vi.fn();
const fetchTriggers = vi.fn();
const triggerPipeline = vi.fn();
const fetchRun = vi.fn();
vi.mock("@portal/api/pipelines", () => ({
  fetchPipelines: () => fetchPipelines(),
  fetchPipeline: (id: string) => fetchPipeline(id),
  savePipeline: (policy: unknown) => savePipeline(policy),
  deletePipeline: (id: string) => deletePipeline(id),
  fetchTriggers: () => fetchTriggers(),
  triggerPipeline: (id: string) => triggerPipeline(id),
  fetchRun: (runId: string) => fetchRun(runId),
}));

const fetchSources = vi.fn();
vi.mock("@portal/api/sources", () => ({
  fetchSources: () => fetchSources(),
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
    {
      id: "plc-archive",
      name: "Archive compressor",
      enabled: true,
      status: "active",
      trigger: "manual",
      sources: [],
      steps: ["/api/v1/misc/compress-pdf"],
      output: "folder",
      owner: "data@acme.com",
    },
  ],
};

const RAW_REDACTION: Policy = {
  id: "plc-redaction",
  name: "Redaction sweep",
  enabled: true,
  trigger: {
    type: "schedule",
    options: { schedule: { type: "every", count: 6, unit: "HOURS" } },
  },
  sourceIds: ["src-claims"],
  steps: [{ operation: "/api/v1/security/auto-redact", parameters: {} }],
  output: { type: "inline", options: {} },
};

const SOURCES: SourcesResponse = {
  kpis: [],
  sources: [
    {
      id: "src-claims",
      name: "Claims intake",
      type: "folder",
      status: "active",
      referenceCount: 1,
      referencingPolicies: [],
      config: [],
      docsTotal: 0,
      docs24h: 0,
      docs30d: 0,
    },
  ],
};

function renderView() {
  return render(
    <MemoryRouter>
      <Pipelines />
    </MemoryRouter>,
  );
}

describe("Pipelines view", () => {
  beforeEach(() => {
    fetchPipelines.mockReset();
    fetchPipeline.mockReset();
    savePipeline.mockReset();
    deletePipeline.mockReset();
    fetchSources.mockReset();
    fetchTriggers.mockReset();
    triggerPipeline.mockReset();
    fetchRun.mockReset();
    // The composer loads the trigger registry on open; default to none.
    fetchTriggers.mockResolvedValue([]);
  });

  it("surfaces the inline error message when a delete fails", async () => {
    fetchPipelines.mockResolvedValue(RESPONSE);
    deletePipeline.mockRejectedValue(
      new HttpError(500, "Server Error", {
        detail: "Could not delete pipeline",
      }),
    );

    renderView();

    fireEvent.click(await screen.findByText("Redaction sweep"));
    fireEvent.click(await screen.findByText("pipelines.detail.delete"));
    fireEvent.click(await screen.findByText("pipelines.delete.confirm"));

    await waitFor(() => {
      expect(deletePipeline).toHaveBeenCalledWith("plc-redaction");
    });
    expect(
      await screen.findByText("Could not delete pipeline"),
    ).toBeInTheDocument();
  });

  it("pauses a pipeline by re-saving it with enabled flipped off", async () => {
    fetchPipelines.mockResolvedValue(RESPONSE);
    fetchPipeline.mockResolvedValue(RAW_REDACTION);
    savePipeline.mockResolvedValue({});

    renderView();

    fireEvent.click(await screen.findByText("Redaction sweep"));
    fireEvent.click(await screen.findByText("pipelines.detail.pause"));

    await waitFor(() => {
      expect(savePipeline).toHaveBeenCalledTimes(1);
    });
    expect(fetchPipeline).toHaveBeenCalledWith("plc-redaction");
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plc-redaction", enabled: false }),
    );
  });

  it("runs a pipeline now and reports success inline", async () => {
    fetchPipelines.mockResolvedValue(RESPONSE);
    triggerPipeline.mockResolvedValue(["run-1"]);
    fetchRun.mockResolvedValue({
      runId: "run-1",
      policyId: "plc-redaction",
      status: "COMPLETED",
      currentStep: 1,
      stepCount: 1,
      error: null,
      errorCode: null,
      createdAt: 0,
    });

    renderView();

    fireEvent.click(await screen.findByText("Redaction sweep"));
    fireEvent.click(await screen.findByText("pipelines.detail.run"));

    await waitFor(() => {
      expect(triggerPipeline).toHaveBeenCalledWith("plc-redaction");
    });
    expect(
      await screen.findByText("pipelines.run.completed"),
    ).toBeInTheDocument();
  });

  it("surfaces an execution failure from a manual run", async () => {
    fetchPipelines.mockResolvedValue(RESPONSE);
    triggerPipeline.mockResolvedValue(["run-1"]);
    fetchRun.mockResolvedValue({
      runId: "run-1",
      policyId: "plc-redaction",
      status: "FAILED",
      currentStep: 1,
      stepCount: 1,
      error: "step 1 blew up",
      errorCode: null,
      createdAt: 0,
    });

    renderView();

    fireEvent.click(await screen.findByText("Redaction sweep"));
    fireEvent.click(await screen.findByText("pipelines.detail.run"));

    expect(await screen.findByText("pipelines.run.failed")).toBeInTheDocument();
  });

  it("creates a pipeline with the chosen name and chained operation", async () => {
    fetchPipelines.mockResolvedValue(RESPONSE);
    fetchSources.mockResolvedValue(SOURCES);
    savePipeline.mockResolvedValue({});

    renderView();

    // Wait for the table so the initial fetch has settled, then open the composer.
    await screen.findByText("Redaction sweep");
    fireEvent.click(screen.getByText("pipelines.actions.newPipeline"));

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Nightly compress" },
    });
    // Operation palette chip labels are derived from the endpoint path.
    fireEvent.click(await screen.findByText("+ Compress"));
    fireEvent.click(screen.getByText("pipelines.composer.create"));

    await waitFor(() => {
      expect(savePipeline).toHaveBeenCalledTimes(1);
    });
    expect(savePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nightly compress",
        trigger: null,
        output: expect.objectContaining({ type: "inline" }),
        steps: [
          expect.objectContaining({ operation: "/api/v1/misc/compress-pdf" }),
        ],
      }),
    );
  });
});
