import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeploymentDetails } from "@processor/components/procurement/DeploymentDetails";

/** What each way to run Enterprise involves, as shown beside the choice in the trial setup. */
const meta: Meta<typeof DeploymentDetails> = {
  title: "Portal/Procurement/Deployment details",
  component: DeploymentDetails,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "20rem" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DeploymentDetails>;

export const StirlingCloud: Story = { args: { deployment: "cloud" } };

export const SelfHosted: Story = { args: { deployment: "selfhost" } };

export const AirGapped: Story = { args: { deployment: "airgap" } };
