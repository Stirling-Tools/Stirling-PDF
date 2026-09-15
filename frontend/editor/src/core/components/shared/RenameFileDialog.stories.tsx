import type { Meta, StoryObj } from "@storybook/react-vite";
import { RenameFileDialog } from "@app/components/shared/RenameFileDialog";

const meta = {
  title: "Shared/RenameFileDialog",
  component: RenameFileDialog,
} satisfies Meta<typeof RenameFileDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    fileName: "Q3 invoice bundle.pdf",
    onClose: () => {},
    onSubmit: () => {},
  },
};

export const NoExtension: Story = {
  args: {
    opened: true,
    fileName: "scanned-document",
    onClose: () => {},
    onSubmit: () => {},
  },
};

export const SaveFails: Story = {
  args: {
    opened: true,
    fileName: "contract.pdf",
    onClose: () => {},
    onSubmit: () => {
      throw new Error("Could not rename the file.");
    },
  },
};
