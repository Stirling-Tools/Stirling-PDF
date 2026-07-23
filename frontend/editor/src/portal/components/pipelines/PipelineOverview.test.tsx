import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import {
  PipelineOverview,
  type OverviewExpanded,
} from "@portal/components/pipelines/PipelineOverview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key.split(".").pop() ?? key,
  }),
}));

const MODE_KEY = "stirling.portal.pipelineViewMode";

/** The flow is the default projection; tests of the word view opt in. */
function asSpec() {
  localStorage.setItem(MODE_KEY, "spec");
}

function renderOverview(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onToggleSection: vi.fn(),
    onSelectStep: vi.fn(),
    onAddStep: vi.fn(),
    onMoveStep: vi.fn(),
    onToggleCode: vi.fn(),
    onRemoveStep: vi.fn(),
  };
  render(
    <MantineProvider>
      <PipelineOverview
        sources={[
          {
            id: "s1",
            name: "Contracts bucket",
            type: "s3",
            detail: "Production S3 · incoming/",
          },
          { id: "s2", name: "Scanner drop", type: "folder" },
        ]}
        triggerLabel="When a file arrives"
        stepLabels={["OCR", "Redact"]}
        outputLabel="Return files"
        outputReady
        expanded={(overrides.expanded as OverviewExpanded) ?? null}
        {...handlers}
        {...overrides}
      />
    </MantineProvider>,
  );
  return handlers;
}

describe("PipelineOverview", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to the flow view: a locked canvas with kind chips and details", () => {
    renderOverview();
    expect(screen.getAllByText("stepOf")).toHaveLength(2);
    expect(screen.getByText("kindStart · s3")).toBeInTheDocument();
    expect(screen.getByText("Production S3 · incoming/")).toBeInTheDocument();
    expect(screen.getByText(/kindEnd/)).toBeInTheDocument();
    expect(screen.getByText("kindTrigger")).toBeInTheDocument();
    // Locked by default: the canvas renders but dragging is frozen.
    expect(
      document.querySelector(".portal-overview__stage--locked"),
    ).toBeInTheDocument();
    expect(screen.getByText("autoArrange")).toBeInTheDocument();
    expect(screen.getByText("unlockLayout")).toBeInTheDocument();
  });

  it("puts a wire insert on every step boundary and reports the position", () => {
    const handlers = renderOverview();
    const inserts = screen.getAllByLabelText("addTool");
    expect(inserts).toHaveLength(3); // before, between, after two steps
    fireEvent.click(inserts[1]);
    expect(handlers.onAddStep).toHaveBeenCalledWith(1);
  });

  it("unlocking keeps the user's layout and just re-enables dragging", () => {
    renderOverview();
    fireEvent.click(screen.getByText("unlockLayout"));
    // Same canvas, no snap to a preset arrangement - only the freeze lifts.
    expect(
      document.querySelector(".portal-overview__stage"),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".portal-overview__stage--locked"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("lockLayout")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-move-step]")).toHaveLength(4);
    expect(localStorage.getItem("stirling.portal.pipelineFlowLock")).toBe(
      "false",
    );
  });

  it("reorders steps from the canvas arrows, ends disabled", () => {
    const handlers = renderOverview();
    const ups = screen.getAllByLabelText("moveUp");
    const downs = screen.getAllByLabelText("moveDown");
    expect(ups).toHaveLength(2);
    expect(ups[0]).toBeDisabled();
    expect(downs[1]).toBeDisabled();
    fireEvent.click(downs[0]);
    expect(handlers.onMoveStep).toHaveBeenCalledWith(0, 1);
    // The cluster also carries a remove control per step.
    fireEvent.click(screen.getAllByLabelText("removeStep")[1]);
    expect(handlers.onRemoveStep).toHaveBeenCalledWith(1);
  });

  it("pulses the step a test run is currently executing", () => {
    renderOverview({ runningStep: 1, completedSteps: 1 });
    expect(screen.getByText("Redact").closest("button")).toHaveClass(
      "portal-overview__node--running",
    );
    expect(screen.getByText("OCR").closest("button")).not.toHaveClass(
      "portal-overview__node--running",
    );
  });

  it("ticks the steps a run has already finished", () => {
    renderOverview({ runningStep: 1, completedSteps: 1 });
    const ocr = screen.getByText("OCR").closest("button")!;
    expect(ocr.querySelector(".portal-overview__node-done")).not.toBeNull();
    const redact = screen.getByText("Redact").closest("button")!;
    expect(redact.querySelector(".portal-overview__node-done")).toBeNull();
  });

  it("pins final-only steps: no trailing insert, locked arrows", () => {
    renderOverview({ stepFinalOnly: [false, true] });
    // Only before/between remain: nothing can follow the locker.
    expect(screen.getAllByLabelText("addTool")).toHaveLength(2);
    expect(screen.getAllByLabelText("moveDown")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("moveUp")[1]).toBeDisabled();
  });

  it("shows a bold tool call to action when the chain is empty", () => {
    const handlers = renderOverview({ stepLabels: [] });
    fireEvent.click(screen.getByText(/chooseToolCta/));
    expect(handlers.onAddStep).toHaveBeenCalled();
  });

  it("raises the code toggle from the header button", () => {
    const handlers = renderOverview();
    const btn = screen.getByText("code").closest("button")!;
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(handlers.onToggleCode).toHaveBeenCalledTimes(1);
  });

  it("switches to the spec view and persists the choice", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("radio", { name: "spec" }));
    expect(screen.getAllByText("andDo")).toHaveLength(2); // Redact + ghost line
    expect(localStorage.getItem(MODE_KEY)).toBe("spec");
  });

  it("starts on spec when a previous session chose it", () => {
    asSpec();
    renderOverview();
    expect(screen.getAllByText("from")).toHaveLength(1);
    expect(screen.getAllByText("andFrom")).toHaveLength(1);
  });

  it("numbers real spec lines and marks ghost lines with a plus", () => {
    asSpec();
    renderOverview();
    // 2 FROM + WHEN + 2 DO + TO = 6 numbered lines.
    const numbers = [...document.querySelectorAll(".portal-overview__n")].map(
      (n) => n.textContent,
    );
    expect(numbers).toEqual(["1", "2", "3", "4", "5", "+", "6"]);
  });

  it("annotates spec lines inline with their detail", () => {
    asSpec();
    renderOverview({ stepSummaries: ["eng · skip-text", undefined] });
    expect(screen.getByText("Production S3 · incoming/")).toBeInTheDocument();
    expect(screen.getByText("eng · skip-text")).toBeInTheDocument();
  });

  it("marks the expanded target's line as active", () => {
    asSpec();
    renderOverview({ expanded: 1 });
    const line = screen.getByText("Redact").closest("button");
    expect(line).toHaveClass("portal-overview__line--active");
  });

  it("routes line clicks to selection, toggling and adding", () => {
    asSpec();
    const handlers = renderOverview();
    fireEvent.click(screen.getByText("Redact"));
    expect(handlers.onSelectStep).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText("When a file arrives"));
    expect(handlers.onToggleSection).toHaveBeenCalledWith("trigger");
    fireEvent.click(screen.getByText("addTool"));
    expect(handlers.onAddStep).toHaveBeenCalled();
  });

  it("offers reorder and remove on step lines", () => {
    asSpec();
    const handlers = renderOverview();
    fireEvent.click(screen.getAllByLabelText("moveDown")[0]);
    expect(handlers.onMoveStep).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getAllByLabelText("removeStep")[1]);
    expect(handlers.onRemoveStep).toHaveBeenCalledWith(1);
  });

  it("annotates steps with their warning note", () => {
    asSpec();
    renderOverview({ stepNotes: [undefined, "needsUpload"] });
    expect(screen.getByText("needsUpload")).toBeInTheDocument();
  });

  it("marks a missing output as a blank instead of a value", () => {
    asSpec();
    renderOverview({ outputReady: false });
    expect(screen.getByText("chooseOutput")).toBeInTheDocument();
    expect(screen.queryByText("Return files")).not.toBeInTheDocument();
  });
});
