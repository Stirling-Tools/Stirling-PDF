import type { Meta, StoryObj } from "@storybook/react-vite";
import LanguageSelector from "@app/components/shared/LanguageSelector";

const meta = {
  title: "Shared/LanguageSelector",
  component: LanguageSelector,
} satisfies Meta<typeof LanguageSelector>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    compact: true,
    tooltip: "Change language",
  },
};

export const TopStartPosition: Story = {
  args: {
    position: "top-start",
    offset: 4,
  },
};
