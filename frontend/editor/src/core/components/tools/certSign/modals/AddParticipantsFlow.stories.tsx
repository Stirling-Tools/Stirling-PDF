import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddParticipantsFlow } from "@app/components/tools/certSign/modals/AddParticipantsFlow";

const meta = {
  title: "Tools/CertSign/Modals/AddParticipantsFlow",
  component: AddParticipantsFlow,
  parameters: { layout: "padded" },
  args: {
    opened: true,
    onClose: () => {},
    onSubmit: async () => {},
  },
} satisfies Meta<typeof AddParticipantsFlow>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
  args: { opened: false },
};
