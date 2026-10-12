import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectSignatureModal } from "@app/components/tools/certSign/modals/SelectSignatureModal";

const meta = {
  title: "Tools/CertSign/Modals/SelectSignatureModal",
  component: SelectSignatureModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    onSignatureSelected: () => {},
    onCreateNew: () => {},
  },
} satisfies Meta<typeof SelectSignatureModal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
