import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormField, Input, Select } from "@app/ui";
import { PipelineInspector } from "@portal/components/pipelines/PipelineInspector";

const meta: Meta<typeof PipelineInspector> = {
  title: "Portal/Pipelines/PipelineInspector",
  component: PipelineInspector,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "22rem" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineInspector>;

/** Stands in for a node's real editor, which the builder supplies. */
function StubSettings() {
  return (
    <>
      <FormField label="Language">
        <Input defaultValue="eng" />
      </FormField>
      <FormField label="Mode">
        <Select
          value="skip"
          onChange={() => {}}
          options={[
            { value: "skip", label: "Skip pages with text" },
            { value: "force", label: "Re-OCR every page" },
          ]}
        />
      </FormField>
    </>
  );
}

/** A step is selected, so its editor is on show. */
export const Settings: Story = {
  render: () => (
    <PipelineInspector title="OCR">
      <StubSettings />
    </PipelineInspector>
  ),
};

/** Nothing selected: the panel says so rather than showing an empty form. */
export const NothingSelected: Story = { render: () => <PipelineInspector /> };

/**
 * The step a test run stopped at. The error belongs to this node, so it reads here - the run's
 * files are pipeline-wide and live in the header instead.
 */
export const FailedStep: Story = {
  render: () => (
    <PipelineInspector
      title="Redact"
      error="Redact: no search terms were configured"
    >
      <StubSettings />
    </PipelineInspector>
  ),
};
