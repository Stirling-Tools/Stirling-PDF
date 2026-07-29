import type { Meta, StoryObj } from "@storybook/react-vite";
import AdvancedSelectionPanel from "@app/components/pageEditor/bulkSelectionPanel/AdvancedSelectionPanel";

const meta = {
  title: "PageEditor/BulkSelectionPanel/AdvancedSelectionPanel",
  component: AdvancedSelectionPanel,
} satisfies Meta<typeof AdvancedSelectionPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    csvInput: "",
    setCsvInput: () => {},
    onUpdatePagesFromCSV: () => {},
    maxPages: 20,
    advancedOpened: true,
  },
};

export const WithExpression: Story = {
  args: {
    csvInput: "1-5, odd",
    setCsvInput: () => {},
    onUpdatePagesFromCSV: () => {},
    maxPages: 20,
    advancedOpened: true,
  },
};

export const Closed: Story = {
  args: {
    csvInput: "",
    setCsvInput: () => {},
    onUpdatePagesFromCSV: () => {},
    maxPages: 20,
    advancedOpened: false,
  },
};
