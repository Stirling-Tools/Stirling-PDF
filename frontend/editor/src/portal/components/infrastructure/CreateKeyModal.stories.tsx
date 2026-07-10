import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateKeyModal } from "@portal/components/infrastructure/CreateKeyModal";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof CreateKeyModal> = {
  title: "Portal/Infrastructure/CreateKeyModal",
  component: CreateKeyModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => console.log("close"),
    onCreated: () => console.log("created"),
    canCreateTeamKeys: true,
    teamName: "Acme Corp",
  },
};
export default meta;
type Story = StoryObj<typeof CreateKeyModal>;

export const Form: Story = {};

export const PersonalOnly: Story = {
  args: { canCreateTeamKeys: false, teamName: null },
};

export const Closed: Story = { args: { open: false } };
