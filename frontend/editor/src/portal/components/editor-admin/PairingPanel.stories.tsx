import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildEditorDeploymentResponse } from "@portal/mocks/editorDeploy";
import { PairingPanel } from "@portal/components/editor-admin/PairingPanel";
import "@portal/views/EditorAdmin.css";

const meta: Meta<typeof PairingPanel> = {
  title: "Portal/EditorAdmin/PairingPanel",
  component: PairingPanel,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PairingPanel>;

/** Pro: token + short code usable, IaC locked behind Enterprise. */
export const Pro: Story = {
  args: { pairings: buildEditorDeploymentResponse("pro").pairings },
};

/** Enterprise: all three methods unlocked, including the IaC module snippet. */
export const Enterprise: Story = {
  args: { pairings: buildEditorDeploymentResponse("enterprise").pairings },
};
