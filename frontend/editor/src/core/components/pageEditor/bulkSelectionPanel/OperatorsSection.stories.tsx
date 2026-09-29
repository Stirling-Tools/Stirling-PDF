import type { Meta, StoryObj } from "@storybook/react-vite";
import OperatorsSection from "@app/components/pageEditor/bulkSelectionPanel/OperatorsSection";

const meta = {
  title: "PageEditor/BulkSelectionPanel/OperatorsSection",
  component: OperatorsSection,
} satisfies Meta<typeof OperatorsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    csvInput: "1,2,3",
    onInsertOperator: (op) => console.log("insert operator", op),
  },
};

export const EmptyInput: Story = {
  args: {
    csvInput: "",
    onInsertOperator: (op) => console.log("insert operator", op),
  },
};
