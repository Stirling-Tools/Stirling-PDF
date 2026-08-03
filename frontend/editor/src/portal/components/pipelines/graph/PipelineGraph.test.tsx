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
    onAddEnd: vi.fn(),
    onRemoveEnd: vi.fn(),
    onInsertStep: vi.fn(),
    onRemoveSteps: vi.fn(),
    onReorderSteps: vi.fn(),
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
    expect(handlers.onSelect).toHaveBeenCalledWith({ steps: [1] });
  });

  it("adds and removes steps from the selection with cmd/ctrl-click", () => {
    const handlers = renderGraph({ selected: { steps: [0] } });
    fireEvent.click(screen.getByText("Redact"), { metaKey: true });
    expect(handlers.onSelect).toHaveBeenCalledWith({ steps: [0, 1] });
  });

  it("cmd/ctrl-clicking the only selected step clears the selection", () => {
    const handlers = renderGraph({ selected: { steps: [1] } });
    fireEvent.click(screen.getByText("Redact"), { ctrlKey: true });
    expect(handlers.onSelect).toHaveBeenCalledWith(null);
  });

  it("shift-click takes everything between the anchor and the clicked step", () => {
    const handlers = renderGraph({
      selected: { steps: [0] },
      steps: [
        { label: "OCR" },
        { label: "Redact" },
        { label: "Compress" },
        { label: "Stamp" },
      ],
    });
    fireEvent.click(screen.getByText("Stamp"), { shiftKey: true });
    expect(handlers.onSelect).toHaveBeenCalledWith({ steps: [0, 1, 2, 3] });
  });

  it("marks every selected step as pressed, not just one", () => {
    renderGraph({ selected: { steps: [0, 1] } });
    for (const label of ["OCR", "Redact"]) {
      expect(screen.getByText(label).closest("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("keeps the drag hint silent until a drag starts", () => {
    // Only the silent half is testable here: starting a real drag needs native HTML5 drag events,
    // which jsdom does not implement, so the visible half is checked in a browser.
    renderGraph();
    expect(
      screen.queryByText("portal.pipelines.graph.dragHint"),
    ).not.toBeInTheDocument();
  });

  it("clears the selection when the canvas itself is clicked", () => {
    const handlers = renderGraph({ selected: { steps: [1] } });
    fireEvent.click(document.querySelector(".portal-graph") as HTMLElement);
    expect(handlers.onSelect).toHaveBeenCalledWith(null);
  });

  it("does not clear the selection when a node is clicked", () => {
    // The node's own handler runs; the background handler must not undo it.
    const handlers = renderGraph({ selected: { steps: [1] } });
    fireEvent.click(screen.getByText("OCR"));
    expect(handlers.onSelect).toHaveBeenCalledWith({ steps: [0] });
    expect(handlers.onSelect).not.toHaveBeenCalledWith(null);
  });

  it("marks the selected node as pressed", () => {
    renderGraph({ selected: { steps: [0] } });
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

  it("holds the first step's place with a placeholder when the chain is empty", () => {
    const handlers = renderGraph({ steps: [] });
    // The placeholder is the affordance, so the wires either side of it carry no plus of their
    // own - two ways to fill the same slot would be a choice with no difference.
    expect(
      screen.queryByLabelText("portal.pipelines.graph.insertHere"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("portal.pipelines.graph.addFirstTool"));
    expect(handlers.onInsertStep).toHaveBeenCalledWith(0);
  });

  it("drops the placeholder once the chain has a step", () => {
    renderGraph({ steps: [{ label: "OCR" }] });
    expect(
      screen.queryByText("portal.pipelines.graph.addFirstTool"),
    ).not.toBeInTheDocument();
  });

  it("warns on the wire arriving at a step it makes little sense to feed", () => {
    renderGraph({
      steps: [
        { label: "Add Password" },
        {
          label: "OCR",
          inputWarning: { text: "OCR cannot read an encrypted file" },
        },
      ],
    });
    expect(
      screen.getByText("OCR cannot read an encrypted file"),
    ).toBeInTheDocument();
  });

  it("still allows the odd pairing: warned wires keep taking inserts", () => {
    // Advisory, not a block - the order stays the user's to choose.
    const handlers = renderGraph({
      steps: [
        { label: "Add Password" },
        {
          label: "OCR",
          inputWarning: { text: "OCR cannot read an encrypted file" },
        },
      ],
    });
    // The warned wire trades its plus for the note, so the two unwarned wires keep theirs.
    const inserts = screen.getAllByLabelText(
      "portal.pipelines.graph.insertHere",
    );
    expect(inserts).toHaveLength(2);
    fireEvent.click(inserts[1]);
    expect(handlers.onInsertStep).toHaveBeenCalledWith(2);
  });

  it("marks a blocking pairing apart from a merely odd one", () => {
    // Both sit on the wire and neither refuses the edit, but one means the chain cannot run at
    // all - so it must not read as the same gentle advice.
    renderGraph({
      steps: [
        { label: "Extract images" },
        {
          label: "Compress",
          inputWarning: { text: "Compress needs a PDF", blocking: true },
        },
      ],
    });
    const wire = screen
      .getByText("Compress needs a PDF")
      .closest(".portal-graph-edge");
    expect(wire).toHaveClass("is-blocking");
  });

  it("leaves an advisory pairing unblocked", () => {
    renderGraph({
      steps: [
        { label: "Add Password" },
        { label: "OCR", inputWarning: { text: "OCR cannot read this" } },
      ],
    });
    expect(
      screen.getByText("OCR cannot read this").closest(".portal-graph-edge"),
    ).not.toHaveClass("is-blocking");
  });

  it("warns on the wire into the output too", () => {
    renderGraph({
      output: {
        label: "Archive",
        inputWarning: { text: "Nothing writes a folder here" },
      },
    });
    expect(
      screen.getByText("Nothing writes a folder here"),
    ).toBeInTheDocument();
  });

  it("removes a step from the node itself", () => {
    const handlers = renderGraph();
    fireEvent.click(
      screen.getByLabelText("portal.pipelines.graph.removeNode:Redact"),
    );
    expect(handlers.onRemoveSteps).toHaveBeenCalledWith([1]);
  });

  it("every node on the chain carries its own remove, ends included", () => {
    renderGraph();
    // Two steps plus both ends: an end can be taken back off to its placeholder.
    expect(screen.getAllByLabelText(/graph.removeNode/)).toHaveLength(4);
  });

  it("takes an end back off the chain", () => {
    const handlers = renderGraph();
    fireEvent.click(
      screen.getByLabelText("portal.pipelines.graph.removeNode:Claims intake"),
    );
    expect(handlers.onRemoveEnd).toHaveBeenCalledWith("input");
  });

  it("deletes every selected step with the Delete key", () => {
    const handlers = renderGraph({ selected: { steps: [0, 1] } });
    fireEvent.keyDown(screen.getByText("Redact"), { key: "Delete" });
    expect(handlers.onRemoveSteps).toHaveBeenCalledWith([0, 1]);
  });

  it("takes a selected end off the chain with the Delete key, like its X does", () => {
    const handlers = renderGraph({ selected: "input" });
    fireEvent.keyDown(screen.getByText("Claims intake"), { key: "Delete" });
    expect(handlers.onRemoveEnd).toHaveBeenCalledWith("input");
    // An end is not a step, so the step remover stays out of it.
    expect(handlers.onRemoveSteps).not.toHaveBeenCalled();
  });

  it("ignores Delete when nothing is selected", () => {
    const handlers = renderGraph({ selected: null });
    fireEvent.keyDown(screen.getByText("OCR"), { key: "Delete" });
    expect(handlers.onRemoveSteps).not.toHaveBeenCalled();
    expect(handlers.onRemoveEnd).not.toHaveBeenCalled();
  });

  describe("an end the pipeline has not asked for yet", () => {
    it("offers to add it instead of naming it", () => {
      renderGraph({ input: null });
      expect(
        screen.getByText("portal.pipelines.graph.add.input"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Claims intake")).not.toBeInTheDocument();
    });

    it("greets a brand new pipeline with no warnings at all", () => {
      // The whole point: an end nobody has been offered yet is not a problem to report.
      renderGraph({
        input: null,
        output: null,
        steps: [],
      });
      expect(screen.queryByText(/warning|chosen/i)).not.toBeInTheDocument();
      expect(screen.getAllByText(/graph.add\./)).toHaveLength(2);
    });

    it("asks for the end when its placeholder is clicked", () => {
      const handlers = renderGraph({ output: null });
      fireEvent.click(screen.getByText("portal.pipelines.graph.add.output"));
      expect(handlers.onAddEnd).toHaveBeenCalledWith("output");
    });

    it("has nothing to remove until it is placed", () => {
      renderGraph({ input: null, output: null, steps: [] });
      expect(
        screen.queryByLabelText(/graph.removeNode/),
      ).not.toBeInTheDocument();
    });

    it("carries no warning onto the wire that arrives at it", () => {
      renderGraph({ output: null });
      expect(
        screen.queryByText("Nothing writes a folder here"),
      ).not.toBeInTheDocument();
    });
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
