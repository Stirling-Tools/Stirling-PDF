import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PipelineHeader,
  type RunResultSummary,
} from "@processor/components/pipelines/PipelineHeader";

const meta: Meta<typeof PipelineHeader> = {
  title: "Processor/Pipelines/PipelineHeader",
  component: PipelineHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PipelineHeader>;

const noop = () => {};

/** The name and the enabled switch are live, so the section can be seen in both states. */
function Playground({
  initialName,
  isEdit,
  initialEnabled = true,
  runResult = null,
  ...rest
}: {
  initialName: string;
  isEdit: boolean;
  initialEnabled?: boolean;
  runResult?: RunResultSummary | null;
  saving?: boolean;
  testing?: boolean;
  running?: boolean;
  canSave?: boolean;
  stepCount?: number;
}) {
  const [name, setName] = useState(initialName);
  const [enabled, setEnabled] = useState(initialEnabled);
  return (
    <PipelineHeader
      name={name}
      onNameChange={setName}
      enabled={enabled}
      onEnabledChange={setEnabled}
      isEdit={isEdit}
      stepCount={rest.stepCount ?? 2}
      canSave={rest.canSave ?? true}
      saving={rest.saving ?? false}
      onSave={noop}
      onCancel={noop}
      onBack={noop}
      onTest={noop}
      testing={rest.testing ?? false}
      onRun={noop}
      running={rest.running ?? false}
      onClearHistory={noop}
      clearingHistory={false}
      onDelete={noop}
      onViewDefinition={noop}
      runResult={runResult}
      onDownloadOutput={noop}
    />
  );
}

/** An existing pipeline: everything is available. */
export const Editing: Story = {
  render: () => <Playground initialName="Claims redaction" isEdit />,
};

/**
 * A pipeline that has never been saved. It can still be tested against a file, but there is
 * nothing yet to run on a schedule, clear history for, or delete.
 */
export const New: Story = {
  render: () => <Playground initialName="" isEdit={false} canSave={false} />,
};

/** Paused: the pipeline exists but its trigger will not fire. */
export const Paused: Story = {
  render: () => (
    <Playground initialName="Claims redaction" isEdit initialEnabled={false} />
  ),
};

/** Mid test-run: the picker shows its own progress while the graph shows the steps. */
export const Testing: Story = {
  render: () => <Playground initialName="Claims redaction" isEdit testing />,
};

/** After a test run: the outcome and its files sit beside the button that started them. */
export const WithRunResult: Story = {
  render: () => (
    <Playground
      initialName="Claims redaction"
      isEdit
      runResult={{
        status: "completed",
        completedSteps: 3,
        stepCount: 3,
        outputs: [
          { fileId: "f1", fileName: "claim-redacted.pdf" },
          { fileId: "f2", fileName: null },
        ],
      }}
    />
  ),
};

/** A failed run: the summary is here, the failing step's own message is on its node. */
export const WithFailedRun: Story = {
  render: () => (
    <Playground
      initialName="Claims redaction"
      isEdit
      runResult={{ status: "failed", completedSteps: 1, stepCount: 3 }}
    />
  ),
};
