import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDropdownMenu } from "@app/components/shared/FileDropdownMenu";

const viewOptionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  padding: "0.25rem 0.5rem",
};

const activeFiles = [
  { fileId: "file-1", name: "Contract-Draft-v1.pdf" },
  { fileId: "file-2", name: "Invoice-2026-04.pdf", versionNumber: 2 },
  { fileId: "file-3", name: "Scanned-Document-With-A-Very-Long-Name.pdf" },
];

const meta: Meta<typeof FileDropdownMenu> = {
  title: "Shared/FileDropdownMenu",
  component: FileDropdownMenu,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    displayName: "Contract-Draft-v1.pdf",
    activeFiles,
    currentFileIndex: 0,
    viewOptionStyle,
    onFileSelect: () => {},
    onFileRemove: () => {},
  },
};

export const Switching: Story = {
  args: {
    ...Default.args,
    switchingTo: "viewer",
  },
};

export const NoRemove: Story = {
  args: {
    ...Default.args,
    onFileRemove: undefined,
  },
};
