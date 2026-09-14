import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  OwnershipTransferModal,
  type OwnershipStatus,
  type OwnershipTransferAdapter,
} from "@app/components/shared/ownership/OwnershipTransferModal";

const ready: OwnershipStatus = {
  targetId: 2,
  targetName: "Jamie Chen",
  targetEmail: "jamie@example.com",
  cloud: {
    teamId: 9,
    teamName: "Acme",
    leaderUserId: 1,
    targetUserId: 2,
    linkedInstances: 2,
    subscribed: true,
    state: "READY",
  },
};

function adapter(
  state: OwnershipStatus,
  local = true,
): OwnershipTransferAdapter {
  return {
    local,
    prepare: async () => state,
    transferCloud: async () => ({
      ...state,
      cloud: state.cloud ? { ...state.cloud, state: "TRANSFERRED" } : null,
    }),
    completeLocal: async () => {},
    invite: async () => state,
    cancel: async () => {},
  };
}

const meta = {
  title: "Ownership/Transfer",
  component: OwnershipTransferModal,
  args: { adapter: adapter(ready), onClose: () => {}, onTransferred: () => {} },
} satisfies Meta<typeof OwnershipTransferModal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedPaid: Story = {};
export const Unlinked: Story = {
  args: { adapter: adapter({ ...ready, cloud: null }) },
};
export const CloudTeam: Story = { args: { adapter: adapter(ready, false) } };
export const Invitation: Story = {
  args: {
    adapter: adapter({
      ...ready,
      cloud: { ...ready.cloud!, targetUserId: null, state: "NEEDS_MEMBERSHIP" },
    }),
  },
};
export const FinishServer: Story = {
  args: {
    adapter: adapter({
      ...ready,
      cloud: { ...ready.cloud!, state: "TRANSFERRED" },
    }),
  },
};
