import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateKeyModal } from "@portal/components/infrastructure/CreateKeyModal";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof CreateKeyModal> = {
  title: "Portal/Infrastructure/CreateKeyModal",
  component: CreateKeyModal,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => console.log("close") },
};
export default meta;
type Story = StoryObj<typeof CreateKeyModal>;

export const Form: Story = {};

export const Closed: Story = { args: { open: false } };
