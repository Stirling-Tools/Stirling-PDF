import type { Meta, StoryObj } from "@storybook/react-vite";
import EditTableOfContentsSettings from "@app/components/tools/editTableOfContents/EditTableOfContentsSettings";
import { BookmarkNode } from "@app/utils/editTableOfContents";

const sampleBookmarks: BookmarkNode[] = [
  {
    id: "1",
    title: "Chapter 1",
    pageNumber: 1,
    expanded: true,
    children: [
      {
        id: "1.1",
        title: "Section 1.1",
        pageNumber: 2,
        expanded: false,
        children: [],
      },
    ],
  },
  {
    id: "2",
    title: "Chapter 2",
    pageNumber: 5,
    expanded: true,
    children: [],
  },
];

const meta = {
  title: "Tools/EditTableOfContents/EditTableOfContentsSettings",
  component: EditTableOfContentsSettings,
  args: {
    bookmarks: sampleBookmarks,
    replaceExisting: true,
    onReplaceExistingChange: () => {},
    onSelectFiles: () => {},
    onLoadFromPdf: () => {},
    onImportJson: () => {},
    onImportClipboard: () => {},
    onExportJson: () => {},
    onExportClipboard: () => {},
    isLoading: false,
    loadError: null,
    canReadClipboard: true,
    canWriteClipboard: true,
    disabled: false,
    selectedFileName: "document.pdf",
  },
} satisfies Meta<typeof EditTableOfContentsSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoFileSelected: Story = {
  args: {
    selectedFileName: undefined,
    bookmarks: [],
  },
};

export const LoadingWithError: Story = {
  args: {
    isLoading: true,
    loadError: "Failed to read bookmarks from the selected PDF.",
  },
};
