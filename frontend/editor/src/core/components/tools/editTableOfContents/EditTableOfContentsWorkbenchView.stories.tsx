import type { Meta, StoryObj } from "@storybook/react-vite";
import EditTableOfContentsWorkbenchView, {
  type EditTableOfContentsWorkbenchViewData,
} from "@app/components/tools/editTableOfContents/EditTableOfContentsWorkbenchView";
import { createBookmarkNode } from "@app/utils/editTableOfContents";

const meta = {
  title: "Tools/EditTableOfContents/EditTableOfContentsWorkbenchView",
  component: EditTableOfContentsWorkbenchView,
} satisfies Meta<typeof EditTableOfContentsWorkbenchView>;
export default meta;

type Story = StoryObj<typeof meta>;

const sampleFile = new File(["%PDF-1.4"], "annual-report.pdf", {
  type: "application/pdf",
});

const sampleBookmarks = [
  createBookmarkNode({
    title: "Introduction",
    pageNumber: 1,
  }),
  createBookmarkNode({
    title: "Chapter 1: Overview",
    pageNumber: 3,
    children: [
      createBookmarkNode({ title: "Background", pageNumber: 4 }),
      createBookmarkNode({ title: "Scope", pageNumber: 6 }),
    ],
  }),
  createBookmarkNode({
    title: "Conclusion",
    pageNumber: 20,
  }),
];

const baseData: EditTableOfContentsWorkbenchViewData = {
  bookmarks: sampleBookmarks,
  selectedFileName: sampleFile.name,
  disabled: false,
  files: [sampleFile],
  thumbnails: [undefined],
  downloadUrl: null,
  downloadFilename: null,
  errorMessage: null,
  isGeneratingThumbnails: false,
  isExecuteDisabled: false,
  isExecuting: false,
  onClearError: () => {},
  onBookmarksChange: () => {},
  onExecute: () => {},
  onUndo: () => {},
  onFileClick: () => {},
};

export const Default: Story = {
  args: {
    data: baseData,
  },
};

export const Empty: Story = {
  args: {
    data: null,
  },
};

export const WithResults: Story = {
  args: {
    data: {
      ...baseData,
      downloadUrl: "blob:https://example.com/annual-report-toc.pdf",
      downloadFilename: "annual-report-toc.pdf",
    },
  },
};

export const WithError: Story = {
  args: {
    data: {
      ...baseData,
      errorMessage: "Failed to apply the table of contents.",
    },
  },
};
