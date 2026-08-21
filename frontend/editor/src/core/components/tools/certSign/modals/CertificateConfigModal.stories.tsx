import type { Meta, StoryObj } from "@storybook/react-vite";
import { CertificateConfigModal } from "@app/components/tools/certSign/modals/CertificateConfigModal";

const meta = {
  title: "Tools/CertSign/Modals/CertificateConfigModal",
  component: CertificateConfigModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    onSign: async () => {},
    signatureCount: 1,
  },
} satisfies Meta<typeof CertificateConfigModal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleSignatures: Story = {
  args: { signatureCount: 3 },
};

export const Disabled: Story = {
  args: { disabled: true },
};
