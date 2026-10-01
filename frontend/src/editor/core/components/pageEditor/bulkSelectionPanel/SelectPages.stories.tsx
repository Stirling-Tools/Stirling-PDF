import type { Meta, StoryObj } from "@storybook/react-vite";
import SelectPages from "@app/components/pageEditor/bulkSelectionPanel/SelectPages";

const meta = {
  title: "PageEditor/SelectPages",
  component: SelectPages,
} satisfies Meta<typeof SelectPages>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Select pages",
    placeholder: "Page number",
    onApply: (value: number) => console.log("apply", value),
    maxPages: 10,
  },
};

export const WithValidation: Story = {
  args: {
    title: "Select pages",
    placeholder: "Page number",
    onApply: (value: number) => console.log("apply", value),
    maxPages: 10,
    validationFn: (value: number) =>
      value > 10 ? "Page number exceeds document length" : null,
  },
};

export const Range: Story = {
  args: {
    title: "Select page range",
    placeholder: "Start page",
    onApply: (value: number) => console.log("apply", value),
    maxPages: 10,
    isRange: true,
    rangeEndValue: 5,
    onRangeEndChange: (value: string | number) =>
      console.log("range end", value),
    rangeEndPlaceholder: "End page",
  },
};
