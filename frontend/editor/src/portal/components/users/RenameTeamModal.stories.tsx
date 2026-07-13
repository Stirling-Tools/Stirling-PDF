import type { Meta, StoryObj } from "@storybook/react-vite";
import { RenameTeamModal } from "@portal/components/users/RenameTeamModal";

const meta: Meta<typeof RenameTeamModal> = {
  title: "Portal/Users/RenameTeamModal",
  component: RenameTeamModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    teamId: 2,
    currentName: "Engineering",
    onClose: () => {},
    onDone: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof RenameTeamModal>;

export const Default: Story = {};
