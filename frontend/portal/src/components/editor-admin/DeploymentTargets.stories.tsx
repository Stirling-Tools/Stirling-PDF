import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildEditorDeploymentResponse } from "@portal/mocks/editorDeploy";
import { TierProvider } from "@portal/contexts/TierContext";
import { DeploymentTargets } from "@portal/components/editor-admin/DeploymentTargets";
import "@portal/views/EditorAdmin.css";

const meta: Meta<typeof DeploymentTargets> = {
  title: "Portal/EditorAdmin/DeploymentTargets",
  component: DeploymentTargets,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DeploymentTargets>;

/** Free: only Managed Cloud runs; Docker + K8s are locked behind a paywall. */
export const Free: Story = {
  args: { targets: buildEditorDeploymentResponse("free").targets },
  decorators: [
    (S) => (
      <TierProvider initialTier="free">
        <S />
      </TierProvider>
    ),
  ],
};

/** Pro: Docker running, Kubernetes available but not yet deployed. */
export const Pro: Story = {
  args: { targets: buildEditorDeploymentResponse("pro").targets },
  decorators: [
    (S) => (
      <TierProvider initialTier="pro">
        <S />
      </TierProvider>
    ),
  ],
};

export const Enterprise: Story = {
  args: { targets: buildEditorDeploymentResponse("enterprise").targets },
  decorators: [
    (S) => (
      <TierProvider initialTier="enterprise">
        <S />
      </TierProvider>
    ),
  ],
};
