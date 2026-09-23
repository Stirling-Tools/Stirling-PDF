import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderNameDialog } from "@app/components/filesPage/FolderNameDialog";

const meta = {
  title: "FilesPage/FolderNameDialog",
  component: FolderNameDialog,
} satisfies Meta<typeof FolderNameDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    title: "New folder",
    submitLabel: "Create",
    onClose: () => {},
    onSubmit: () => {},
  },
};

export const Rename: Story = {
  args: {
    opened: true,
    title: "Rename folder",
    initialName: "Invoices 2026",
    submitLabel: "Save",
    onClose: () => {},
    onSubmit: () => {},
  },
};
