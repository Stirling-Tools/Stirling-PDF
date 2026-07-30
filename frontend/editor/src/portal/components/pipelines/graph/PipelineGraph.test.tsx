import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import {
  PipelineGraph,
  type PipelineGraphProps,
} from "@portal/components/pipelines/graph/PipelineGraph";

// The nodes and wires are built from the shared Mantine-backed controls, so they need the provider.
const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

// Deterministic i18n: keys returned verbatim, interpolation applied so aria-labels stay distinct.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.name ? `${key}:${String(vars.name)}` : key,
  }),
}));

function renderGraph(overrides: Partial<PipelineGraphProps> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onInsertStep: vi.fn(),
    onRemoveStep: vi.fn(),
    onReorderStep: vi.fn(),
  };
  render(
    <PipelineGraph
      input={{ label: "Claims intake", detail: "/in - every hour" }}
      output={{ label: "Archive bucket", detail: "s3://claims/done" }}
      steps={[
        { label: "OCR", detail: "eng" },
        { label: "Redact", detail: "2 terms" },
      ]}
      selected={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("PipelineGraph", () => {
  it("renders the chain: input, each step in order, output", () => {
    renderGraph();
    const titles = screen
      .getAllByRole("button", { pressed: false })
      .map((node) => node.textContent);
    expect(titles[0]).toContain("Claims intake");
    expect(titles[1]).toContain("OCR");
    expect(titles[2]).toContain("Redact");
    expect(titles[3]).toContain("Archive bucket");
  });

  it("shows each node's one-line detail", () => {
    renderGraph();
    expect(screen.getByText("/in - every hour")).toBeInTheDocument();
    expect(screen.getByText("s3://claims/done")).toBeInTheDocument();
  });

  it("selects the ends by their kind and steps by index", () => {
    const handlers = renderGraph();
    fireEvent.click(screen.getByText("Claims intake"));
    expect(handlers.onSelect).toHaveBeenCalledWith("input");
    fireEvent.click(screen.getByText("Archive bucket"));
    expect(handlers.onSelect).toHaveBeenCalledWith("output");
    fireEvent.click(screen.getByText("Redact"));
    expect(handlers.onSelect).toHaveBeenCalledWith(1);
  });

  it("marks the selected node as pressed", () => {
    renderGraph({ selected: 0 });
    expect(screen.getByText("OCR").closest("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("puts an insert on every wire, reporting the slot it opens", () => {
    const handlers = renderGraph();
    // input->OCR, OCR->Redact, Redact->output
    const inserts = screen.getAllByLabelText(
      "portal.pipelines.graph.insertHere",
    );
    expect(inserts).toHaveLength(3);
    fireEvent.click(inserts[1]);
    expect(handlers.onInsertStep).toHaveBeenCalledWith(1);
  });

  it("offers a single insert when the chain is empty, plus a hint", () => {
    const handlers = renderGraph({ steps: [] });
    const inserts = screen.getAllByLabelText(
      "portal.pipelines.graph.insertHere",
    );
    expect(inserts).toHaveLength(1);
    fireEvent.click(inserts[0]);
    expect(handlers.onInsertStep).toHaveBeenCalledWith(0);
    expect(
      screen.getByText("portal.pipelines.graph.emptyHint"),
    ).toBeInTheDocument();
  });

  it("closes the wire below a step that must stay last", () => {
    // Add Password locks the output, so nothing may be inserted after it.
    renderGraph({
      steps: [{ label: "OCR" }, { label: "Add Password", finalOnly: true }],
    });
    // input->OCR and OCR->Add Password stay open; Add Password->output does not.
    expect(
      screen.getAllByLabelText("portal.pipelines.graph.insertHere"),
    ).toHaveLength(2);
  });

  it("removes a step from the node itself, and not the chain's ends", () => {
    const handlers = renderGraph();
    const removes = screen.getAllByLabelText(/graph.removeNode/);
    // Only the two steps carry a remove; input and output are part of every pipeline.
    expect(removes).toHaveLength(2);
    fireEvent.click(
      screen.getByLabelText("portal.pipelines.graph.removeNode:Redact"),
    );
    expect(handlers.onRemoveStep).toHaveBeenCalledWith(1);
  });

  it("deletes the selected step with the Delete key", () => {
    const handlers = renderGraph({ selected: 1 });
    fireEvent.keyDown(screen.getByText("Redact"), { key: "Delete" });
    expect(handlers.onRemoveStep).toHaveBeenCalledWith(1);
  });

  it("ignores Delete when an end of the chain is selected", () => {
    const handlers = renderGraph({ selected: "input" });
    fireEvent.keyDown(screen.getByText("Claims intake"), { key: "Delete" });
    expect(handlers.onRemoveStep).not.toHaveBeenCalled();
  });

  it("shows a node's warning in place of its detail", () => {
    renderGraph({
      steps: [
        { label: "Watermark", detail: "logo.png", warning: "Needs a file" },
      ],
    });
    expect(screen.getByText("Needs a file")).toBeInTheDocument();
    expect(screen.queryByText("logo.png")).not.toBeInTheDocument();
  });

  it("reports a run's progress on the steps it touched", () => {
    renderGraph({
      steps: [
        { label: "OCR", runState: "done" },
        { label: "Redact", runState: "running" },
      ],
    });
    expect(
      screen.getByText("portal.pipelines.graph.run.done"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.graph.run.running"),
    ).toBeInTheDocument();
  });
});
