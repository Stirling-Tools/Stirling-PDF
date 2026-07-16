import type { Meta, StoryObj } from "@storybook/react-vite";
import SubcategoryHeader from "@app/components/tools/shared/SubcategoryHeader";

const meta = {
  title: "Tools/Shared/SubcategoryHeader",
  component: SubcategoryHeader,
} satisfies Meta<typeof SubcategoryHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Page organization",
  },
};

export const CustomSpacing: Story = {
  args: {
    label: "Security",
    mt: "2rem",
    mb: "1rem",
  },
};
