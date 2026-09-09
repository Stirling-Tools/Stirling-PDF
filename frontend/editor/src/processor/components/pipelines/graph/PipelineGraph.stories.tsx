import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PipelineGraph,
  selectedSteps,
  type ChainEnd,
  type GraphNodeContent,
  type GraphSelection,
  type GraphStepContent,
} from "@processor/components/pipelines/graph/PipelineGraph";

const meta: Meta<typeof PipelineGraph> = {
  title: "Processor/Pipelines/PipelineGraph",
  component: PipelineGraph,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PipelineGraph>;

const INPUT = {
  label: "Claims intake",
  detail: "/srv/claims/in - every hour",
};
const OUTPUT = {
  label: "Archive bucket",
  detail: "s3://claims-archive/done",
};

/**
 * The builder owns the chain in the app, so the stories own it here - otherwise adding, removing
 * and dragging would fire their handlers and visibly do nothing. Everything in these stories is
 * live: click a wire's plus to insert, the node's X to remove, and drag a step onto a wire to move
 * it there.
 */
function Playground({
  initialSteps,
  output = OUTPUT,
  /** Start with neither end on the chain, the way a brand new pipeline opens. */
  unplacedEnds = false,
}: {
  initialSteps: GraphStepContent[];
  output?: { label: string; detail?: string; warning?: string };
  unplacedEnds?: boolean;
}) {
  const [steps, setSteps] = useState<GraphStepContent[]>(initialSteps);
  const [selected, setSelected] = useState<GraphSelection>(null);
  const [added, setAdded] = useState(0);
  const [inputEnd, setInputEnd] = useState<GraphNodeContent | null>(
    unplacedEnds ? null : INPUT,
  );
  const [outputEnd, setOutputEnd] = useState<GraphNodeContent | null>(
    unplacedEnds ? null : output,
  );

  // Placing an end leaves it owing a choice, which is the warning state the builder shows until the
  // user picks a source or destination.
  function addEnd(end: ChainEnd) {
    if (end === "input") {
      setInputEnd({ label: "Choose a source", warning: "No source chosen" });
    } else {
      setOutputEnd({
        label: "Choose a destination",
        warning: "No destination chosen",
      });
    }
    setSelected(end);
  }

  function removeEnd(end: ChainEnd) {
    if (end === "input") setInputEnd(null);
    else setOutputEnd(null);
    setSelected((current) => (current === end ? null : current));
  }

  function insert(at: number) {
    const label = `New tool ${added + 1}`;
    setAdded((n) => n + 1);
    setSteps((current) => {
      const next = [...current];
      next.splice(at, 0, { label });
      return next;
    });
    setSelected({ steps: [at] });
  }

  function remove(indices: number[]) {
    const gone = new Set(indices);
    setSteps((current) => current.filter((_, i) => !gone.has(i)));
    setSelected(null);
  }

  function reorder(order: number[]) {
    const moving = new Set(selectedSteps(selected));
    setSteps((current) => order.map((i) => current[i]));
    const landed = order
      .map((original, position) => ({ original, position }))
      .filter(({ original }) => moving.has(original))
      .map(({ position }) => position);
    setSelected(landed.length > 0 ? { steps: landed } : null);
  }

  return (
    <PipelineGraph
      input={inputEnd}
      output={outputEnd}
      steps={steps}
      selected={selected}
      onSelect={setSelected}
      onAddEnd={addEnd}
      onRemoveEnd={removeEnd}
      onInsertStep={insert}
      onRemoveSteps={remove}
      onReorderSteps={reorder}
    />
  );
}

/** A typical chain. Drag a step onto any wire to move it there. */
export const Default: Story = {
  render: () => (
    <Playground
      initialSteps={[
        { label: "OCR", detail: "eng, skip text pages" },
        { label: "Redact", detail: "2 terms" },
        { label: "Compress", detail: "level 7" },
      ]}
    />
  ),
};

/** A pipeline with its ends settled but no steps yet: the placeholder holds the first step's place. */
export const Empty: Story = {
  render: () => <Playground initialSteps={[]} />,
};

/**
 * A brand new pipeline, before anything has been chosen. Every row is an invitation rather than a
 * complaint - nothing is wrong yet, because nothing has been asked of the user. Click an end to
 * place it (it then owes a choice, and says so), and its X puts it back.
 */
export const NewPipeline: Story = {
  render: () => <Playground initialSteps={[]} unplacedEnds />,
};

/**
 * An order that will not do what the user probably meant: OCR cannot read a file that the previous
 * step encrypted. The wire says so and the chain still runs - nothing is refused, and the step can
 * still be dragged anywhere.
 */
export const OddOrdering: Story = {
  render: () => (
    <Playground
      initialSteps={[
        { label: "Add Password", detail: "128-bit" },
        {
          label: "OCR",
          detail: "eng",
          inputWarning: { text: "OCR cannot read an encrypted file" },
        },
      ]}
    />
  ),
};

/** Mid test-run: finished steps carry a tick, the current one pulses. */
export const Running: Story = {
  render: () => (
    <Playground
      initialSteps={[
        { label: "OCR", detail: "eng", runState: "done" },
        { label: "Redact", detail: "2 terms", runState: "running" },
        { label: "Compress", detail: "level 7" },
      ]}
    />
  ),
};

/** A failed run, and a step that cannot be saved: the warning replaces the detail line. */
export const Problems: Story = {
  render: () => (
    <Playground
      output={{ label: "Choose a destination", warning: "No destination set" }}
      initialSteps={[
        { label: "OCR", detail: "eng", runState: "done" },
        { label: "Redact", detail: "2 terms", runState: "failed" },
        { label: "Watermark", warning: "Needs an uploaded file" },
      ]}
    />
  ),
};

/**
 * Multi-selection: cmd/ctrl-click to add a step, shift-click for a run of them, then drag any one
 * onto a line to move the whole set together.
 */
export const MultiSelect: Story = {
  render: () => (
    <Playground
      initialSteps={[
        { label: "OCR", detail: "eng" },
        { label: "Redact", detail: "2 terms" },
        { label: "Compress", detail: "level 7" },
        { label: "Stamp", detail: "footer" },
      ]}
    />
  ),
};
