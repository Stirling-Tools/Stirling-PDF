import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectParticipantsStep } from "@app/components/shared/signing/steps/SelectParticipantsStep";

const meta = {
  title: "Shared/Signing/Steps/SelectParticipantsStep",
  component: SelectParticipantsStep,
  parameters: { layout: "padded" },
  args: {
    selectedUserIds: [],
    onSelectedUserIdsChange: () => {},
    onBack: () => {},
    onNext: () => {},
  },
} satisfies Meta<typeof SelectParticipantsStep>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelection: Story = {
  args: { selectedUserIds: [1, 2] },
};

export const Disabled: Story = {
  args: { disabled: true },
};
