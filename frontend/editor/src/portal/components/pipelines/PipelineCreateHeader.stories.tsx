import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineCreateHeader } from "@portal/components/pipelines/PipelineCreateHeader";

const meta: Meta<typeof PipelineCreateHeader> = {
  title: "Portal/Pipelines/PipelineCreateHeader",
  component: PipelineCreateHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PipelineCreateHeader>;

const noop = () => {};

/** The name is live, so the toolbar can be seen as it is filled in. */
function Playground({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  return (
    <PipelineCreateHeader
      name={name}
      onNameChange={setName}
      canSave={name.trim() !== ""}
      saving={false}
      pendingCreateEnabled={null}
      onCreate={noop}
      onCreatePaused={noop}
      onBack={noop}
      onViewDefinition={noop}
    />
  );
}

/** A new pipeline: the create actions stay disabled until it is named (and, in the app, valid). */
export const New: Story = {
  render: () => <Playground initialName="" />,
};

/** Named: the create actions become available. */
export const Named: Story = {
  render: () => <Playground initialName="Claims redaction" />,
};
