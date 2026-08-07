import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildEditorDeploymentResponse } from "@processor/mocks/editorDeploy";
import { DeploymentSummaryStrip } from "@processor/components/editor-admin/DeploymentSummaryStrip";
import "@processor/views/EditorAdmin.css";

const meta: Meta<typeof DeploymentSummaryStrip> = {
  title: "Portal/EditorAdmin/DeploymentSummaryStrip",
  component: DeploymentSummaryStrip,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DeploymentSummaryStrip>;

export const Pro: Story = {
  args: { summary: buildEditorDeploymentResponse("pro").summary },
};

export const Enterprise: Story = {
  args: { summary: buildEditorDeploymentResponse("enterprise").summary },
};

export const Loading: Story = {
  args: { loading: true },
};
