import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildEditorDeploymentResponse } from "@portal/mocks/editorDeploy";
import { DeploymentSummaryStrip } from "@portal/components/editor-admin/DeploymentSummaryStrip";
import "@portal/views/EditorAdmin.css";

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
