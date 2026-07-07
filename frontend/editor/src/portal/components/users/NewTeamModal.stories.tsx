import type { Meta, StoryObj } from "@storybook/react-vite";
import { NewTeamModal } from "@portal/components/users/NewTeamModal";

const meta: Meta<typeof NewTeamModal> = {
  title: "Portal/Users/NewTeamModal",
  component: NewTeamModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => {},
    onCreated: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof NewTeamModal>;

/** Create a team and (optionally) invite its owner. */
export const Default: Story = {};
