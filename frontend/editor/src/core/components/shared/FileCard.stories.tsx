import type { Meta, StoryObj } from "@storybook/react-vite";
import FileCard from "@app/components/shared/FileCard";
import { FileContextProvider } from "@app/contexts/FileContext";
import { StirlingFileStub, FileId } from "@app/types/fileContext";

function makeFile(name: string, type = "application/pdf"): File {
  return new File(["%PDF-1.4 storybook fixture"], name, {
    type,
    lastModified: Date.now(),
  });
}

function makeStub(id: string): StirlingFileStub {
  return {
    id: id as FileId,
    name: "Annual-Report-2026.pdf",
    type: "application/pdf",
    size: 245_760,
    lastModified: Date.now(),
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
  };
}

/** FileCard reads/writes files via FileContext + IndexedDB, so it needs a real provider tree. */
const meta = {
  title: "Shared/FileCard",
  component: FileCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <FileContextProvider>
        <Story />
      </FileContextProvider>
    ),
  ],
} satisfies Meta<typeof FileCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: makeFile("Annual-Report-2026.pdf"),
    fileStub: makeStub("story-file-1"),
    onRemove: () => {},
    onView: () => {},
    onEdit: () => {},
  },
};

export const Selected: Story = {
  args: {
    ...Default.args,
    isSelected: true,
    onSelect: () => {},
  },
};

export const Unsupported: Story = {
  args: {
    ...Default.args,
    isSupported: false,
  },
};
