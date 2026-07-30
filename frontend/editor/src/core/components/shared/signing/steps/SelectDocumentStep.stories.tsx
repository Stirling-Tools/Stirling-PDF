import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectDocumentStep } from "@app/components/shared/signing/steps/SelectDocumentStep";
import type { FileState } from "@app/types/file";

const meta = {
  title: "Shared/Signing/SelectDocumentStep",
  component: SelectDocumentStep,
  parameters: { layout: "padded" },
  args: {
    selectedFiles: [] as FileState[],
    onNext: () => {},
  },
} satisfies Meta<typeof SelectDocumentStep>;
export default meta;
type Story = StoryObj<typeof meta>;

const mockFile: FileState = {
  name: "contract-agreement.pdf",
  size: 2.4 * 1024 * 1024,
};

export const NoFileSelected: Story = {};

export const Default: Story = {
  args: {
    selectedFiles: [mockFile],
  },
};

export const MultipleFilesSelected: Story = {
  args: {
    selectedFiles: [mockFile, { name: "addendum.pdf", size: 512 * 1024 }],
  },
};
