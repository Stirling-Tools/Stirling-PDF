import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PipelineGraph,
  type GraphSelection,
  type GraphStepContent,
} from "@portal/components/pipelines/graph/PipelineGraph";

const meta: Meta<typeof PipelineGraph> = {
  title: "Portal/Pipelines/PipelineGraph",
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
}: {
  initialSteps: GraphStepContent[];
  output?: { label: string; detail?: string; warning?: string };
}) {
  const [steps, setSteps] = useState<GraphStepContent[]>(initialSteps);
  const [selected, setSelected] = useState<GraphSelection>(null);
  const [added, setAdded] = useState(0);

  function insert(at: number) {
    const label = `New tool ${added + 1}`;
    setAdded((n) => n + 1);
    setSteps((current) => current.toSpliced(at, 0, { label }));
    setSelected(at);
  }

  function remove(index: number) {
    setSteps((current) => current.toSpliced(index, 1));
    setSelected(null);
  }

  function reorder(from: number, to: number) {
    setSteps((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSelected(to);
  }

  return (
    <PipelineGraph
      input={INPUT}
      output={output}
      steps={steps}
      selected={selected}
      onSelect={setSelected}
      onInsertStep={insert}
      onRemoveStep={remove}
      onReorderStep={reorder}
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

/** A new pipeline: the placeholder holds the first step's place and is the thing you click. */
export const Empty: Story = {
  render: () => <Playground initialSteps={[]} />,
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
          inputWarning: "OCR cannot read an encrypted file",
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
