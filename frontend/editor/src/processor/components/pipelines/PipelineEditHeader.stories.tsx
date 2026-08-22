import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineEditHeader } from "@processor/components/pipelines/PipelineEditHeader";

const meta: Meta<typeof PipelineEditHeader> = {
  title: "Processor/Pipelines/PipelineEditHeader",
  component: PipelineEditHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PipelineEditHeader>;

const noop = () => {};

/** The name and the pause/activate state are live, so both can be exercised. */
function Playground({
  initialName,
  initialEnabled = true,
  canSave = true,
  blockers = [],
}: {
  initialName: string;
  initialEnabled?: boolean;
  canSave?: boolean;
  blockers?: string[];
}) {
  const [name, setName] = useState(initialName);
  const [enabled, setEnabled] = useState(initialEnabled);
  return (
    <PipelineEditHeader
      name={name}
      onNameChange={setName}
      enabled={enabled}
      onTogglePause={() => setEnabled((e) => !e)}
      togglingEnabled={false}
      onBack={noop}
      canSave={canSave}
      blockers={blockers}
      saving={false}
      onSave={noop}
      onRun={noop}
      running={false}
      onReprocess={noop}
      reprocessing={false}
      onDelete={noop}
    />
  );
}

/** A live pipeline: the toggle offers to pause it. */
export const Active: Story = {
  render: () => <Playground initialName="Claims redaction" />,
};

/** A paused pipeline: the toggle offers to activate it. */
export const Paused: Story = {
  render: () => (
    <Playground initialName="Claims redaction" initialEnabled={false} />
  ),
};

/** Edits that cannot yet be saved: Save is disabled and hovering it lists what's still needed. */
export const CannotSave: Story = {
  render: () => (
    <Playground
      initialName="Claims redaction"
      canSave={false}
      blockers={["Choose a destination", "Finish setting up: Redact"]}
    />
  ),
};
