import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildEditorDeploymentResponse } from "@portal/mocks/editorDeploy";
import { InstanceHealthTable } from "@portal/components/editor-admin/InstanceHealthTable";
import "@portal/views/EditorAdmin.css";

const meta: Meta<typeof InstanceHealthTable> = {
  title: "Portal/EditorAdmin/InstanceHealthTable",
  component: InstanceHealthTable,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof InstanceHealthTable>;

/** Pro: Managed Cloud + two Docker edge nodes, one on a stale version. */
export const Pro: Story = {
  args: { instances: buildEditorDeploymentResponse("pro").instances },
};

/** Enterprise: adds the K8s fleet and an offline air-gapped node. */
export const Enterprise: Story = {
  args: { instances: buildEditorDeploymentResponse("enterprise").instances },
};

export const Empty: Story = {
  args: { instances: [] },
};
