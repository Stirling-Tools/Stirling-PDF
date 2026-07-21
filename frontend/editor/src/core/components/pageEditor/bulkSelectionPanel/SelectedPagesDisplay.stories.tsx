import type { Meta, StoryObj } from "@storybook/react-vite";
import SelectedPagesDisplay from "@app/components/pageEditor/bulkSelectionPanel/SelectedPagesDisplay";

const displayDocument = {
  pages: [
    { id: "page-1", pageNumber: 1 },
    { id: "page-2", pageNumber: 2 },
    { id: "page-3", pageNumber: 3 },
    { id: "page-4", pageNumber: 4 },
  ],
};

const meta = {
  title: "PageEditor/SelectedPagesDisplay",
  component: SelectedPagesDisplay,
} satisfies Meta<typeof SelectedPagesDisplay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    selectedPageIds: ["page-1", "page-3"],
    displayDocument,
    syntaxError: null,
  },
};

export const SyntaxError: Story = {
  args: {
    selectedPageIds: ["page-1", "page-3"],
    displayDocument,
    syntaxError: "Invalid page range: 1-abc",
  },
};
