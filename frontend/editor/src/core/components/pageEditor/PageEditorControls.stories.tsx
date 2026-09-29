import type { Meta, StoryObj } from "@storybook/react-vite";
import PageEditorControls from "@app/components/pageEditor/PageEditorControls";

const meta = {
  title: "PageEditor/PageEditorControls",
  component: PageEditorControls,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PageEditorControls>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  onClosePdf: () => {},
  onUndo: () => {},
  onRedo: () => {},
  canUndo: true,
  canRedo: true,
  onRotate: () => {},
  onDelete: () => {},
  onSplit: () => {},
  onSplitAll: () => {},
  onPageBreak: () => {},
  onPageBreakAll: () => {},
  onExportAll: () => {},
  exportLoading: false,
  selectionMode: true,
  selectedPageIds: ["page-1", "page-2"],
  displayDocument: {
    pages: [
      { id: "page-1", pageNumber: 1 },
      { id: "page-2", pageNumber: 2 },
      { id: "page-3", pageNumber: 3 },
    ],
  },
  splitPositions: new Set<string>(),
  totalPages: 3,
};

export const Default: Story = {
  args: baseArgs,
};

export const NoSelection: Story = {
  args: {
    ...baseArgs,
    selectedPageIds: [],
    canUndo: false,
    canRedo: false,
  },
};

export const WithExistingSplits: Story = {
  args: {
    ...baseArgs,
    splitPositions: new Set<string>(["page-1", "page-2"]),
  },
};
