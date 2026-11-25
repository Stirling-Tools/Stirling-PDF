import type { Meta, StoryObj } from "@storybook/react-vite";
import { SetupChecklist } from "@processor/components/procurement/SetupChecklist";
import "@processor/views/Enterprise.css";

/** The trial's setup steps, one set per deployment; at go-live the same steps form the rollout list. */
const meta: Meta<typeof SetupChecklist> = {
  title: "Portal/Procurement/Setup checklist",
  component: SetupChecklist,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="ent" style={{ height: "auto", padding: "1.5rem" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    dealId: 1,
    licenseKey: "TRIAL-KEY-0001",
    live: false,
    teamSize: 1,
    onInvite: () => {},
    onDownloadOfflineLicense: () => {},
    downloadingLicense: false,
  },
};
export default meta;
type Story = StoryObj<typeof SetupChecklist>;

export const StirlingCloud: Story = { args: { deployment: "cloud" } };

/** A teammate has joined, so inviting is ticked from the account and cannot be unticked. */
export const CloudTeamInvited: Story = {
  args: { deployment: "cloud", teamSize: 3, dealId: 2 },
};

export const SelfHosted: Story = {
  args: { deployment: "selfhost", dealId: 3 },
};

export const AirGapped: Story = { args: { deployment: "airgap", dealId: 4 } };

export const GoLive: Story = {
  args: { deployment: "selfhost", live: true, dealId: 5 },
};
