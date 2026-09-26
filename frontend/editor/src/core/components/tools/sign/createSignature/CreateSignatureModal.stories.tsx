import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateSignatureModal } from "@app/components/tools/sign/createSignature/CreateSignatureModal";

const limits = {
  canSave: true,
  maxLimit: 20,
  canShare: false,
  browserStorage: false,
};

const meta = {
  title: "Tools/Sign/CreateSignatureModal",
  component: CreateSignatureModal,
  parameters: { layout: "fullscreen" },
  args: {
    initialTab: "draw",
    onClose: () => {},
    onCreate: async () => {},
    limits,
    showPhoneTab: false,
    existingLabels: ["My signature"],
  },
} satisfies Meta<typeof CreateSignatureModal>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Draw: Story = {};

export const Type: Story = {
  args: { initialTab: "type" },
};

export const Upload: Story = {
  args: { initialTab: "upload" },
};

export const AdminCanShare: Story = {
  args: { limits: { ...limits, canShare: true } },
};

export const LibraryFull: Story = {
  args: { limits: { ...limits, canSave: false } },
};
