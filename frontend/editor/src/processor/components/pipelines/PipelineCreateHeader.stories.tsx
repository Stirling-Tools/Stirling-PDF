import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineCreateHeader } from "@processor/components/pipelines/PipelineCreateHeader";

const meta: Meta<typeof PipelineCreateHeader> = {
  title: "Processor/Pipelines/PipelineCreateHeader",
  component: PipelineCreateHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PipelineCreateHeader>;

const noop = () => {};

/**
 * The name is live, so the toolbar can be seen as it is filled in. Until it is named (a stand-in for
 * the app's full validity check) the create buttons are disabled and carry a tooltip of what's owed.
 */
function Playground({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const blockers =
    name.trim() === ""
      ? [
          "Give the pipeline a name",
          "Choose an input source",
          "Choose a destination",
        ]
      : [];
  return (
    <PipelineCreateHeader
      name={name}
      onNameChange={setName}
      canSave={blockers.length === 0}
      blockers={blockers}
      saving={false}
      pendingCreateEnabled={null}
      onCreate={noop}
      onCreatePaused={noop}
      onBack={noop}
    />
  );
}

/** A new pipeline: create is disabled, and hovering it lists what's still needed. */
export const New: Story = {
  render: () => <Playground initialName="" />,
};

/** Named: the create actions become available. */
export const Named: Story = {
  render: () => <Playground initialName="Claims redaction" />,
};
