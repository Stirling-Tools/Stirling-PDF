import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PipelineGraph,
  type GraphSelection,
  type PipelineGraphProps,
} from "@portal/components/pipelines/graph/PipelineGraph";

const meta: Meta<typeof PipelineGraph> = {
  title: "Portal/Pipelines/PipelineGraph",
  component: PipelineGraph,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PipelineGraph>;

/**
 * Selection is owned by the builder in the app, so the stories hold it themselves - otherwise
 * clicking a node would do nothing and the selected state could not be seen.
 */
function Interactive(props: Omit<PipelineGraphProps, "selected" | "onSelect">) {
  const [selected, setSelected] = useState<GraphSelection>(null);
  return (
    <PipelineGraph {...props} selected={selected} onSelect={setSelected} />
  );
}

const noop = () => {};

const BASE = {
  input: { label: "Claims intake", detail: "/srv/claims/in - every hour" },
  output: { label: "Archive bucket", detail: "s3://claims-archive/done" },
  onInsertStep: noop,
  onRemoveStep: noop,
  onReorderStep: noop,
};

/** A typical chain: click a node to select it, drag a step onto a wire to move it. */
export const Default: Story = {
  render: () => (
    <Interactive
      {...BASE}
      steps={[
        { label: "OCR", detail: "eng, skip text pages" },
        { label: "Redact", detail: "2 terms" },
        { label: "Compress", detail: "level 7" },
      ]}
    />
  ),
};

/** A new pipeline: the single wire carries the only insert, plus the hint below. */
export const Empty: Story = {
  render: () => <Interactive {...BASE} steps={[]} />,
};

/**
 * Add Password locks the output, so the wire beneath it opens no slot - nothing can run after
 * encryption.
 */
export const TerminalStep: Story = {
  render: () => (
    <Interactive
      {...BASE}
      steps={[
        { label: "OCR", detail: "eng" },
        { label: "Add Password", detail: "128-bit", finalOnly: true },
      ]}
    />
  ),
};

/** Mid test-run: finished steps carry a tick, the current one pulses. */
export const Running: Story = {
  render: () => (
    <Interactive
      {...BASE}
      steps={[
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
    <Interactive
      {...BASE}
      output={{ label: "Choose a destination", warning: "No destination set" }}
      steps={[
        { label: "OCR", detail: "eng", runState: "done" },
        { label: "Redact", detail: "2 terms", runState: "failed" },
        { label: "Watermark", warning: "Needs an uploaded file" },
      ]}
    />
  ),
};
