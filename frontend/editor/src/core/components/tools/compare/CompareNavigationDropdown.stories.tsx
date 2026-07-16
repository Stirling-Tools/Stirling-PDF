import type { Meta, StoryObj } from "@storybook/react-vite";
import CompareNavigationDropdown from "@app/components/tools/compare/CompareNavigationDropdown";

const meta = {
  title: "Compare/CompareNavigationDropdown",
  component: CompareNavigationDropdown,
} satisfies Meta<typeof CompareNavigationDropdown>;
export default meta;
type Story = StoryObj<typeof meta>;

const sampleChanges = [
  {
    value: "change-1",
    label: "Introduction paragraph reworded",
    pageNumber: 1,
  },
  { value: "change-2", label: "Budget table updated", pageNumber: 1 },
  { value: "change-3", label: "New clause added", pageNumber: 2 },
  { value: "change-4", label: "Signature date changed", pageNumber: 3 },
];

export const Default: Story = {
  args: {
    changes: sampleChanges,
    placeholder: "Jump to change",
    onNavigate: (value, pageNumber) => {
      console.log("navigate", value, pageNumber);
    },
    renderedPageNumbers: new Set([1, 2, 3]),
  },
};

export const Empty: Story = {
  args: {
    changes: [],
    placeholder: "Jump to change",
    onNavigate: () => {},
  },
};

export const RenderingInProgress: Story = {
  args: {
    changes: sampleChanges,
    placeholder: "Jump to change",
    onNavigate: () => {},
    renderedPageNumbers: new Set([1]),
  },
};
