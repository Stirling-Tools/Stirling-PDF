import type { Meta, StoryObj } from "@storybook/react-vite";
import FavoriteStar from "@app/components/tools/toolPicker/FavoriteStar";

const meta = {
  title: "Tools/ToolPicker/FavoriteStar",
  component: FavoriteStar,
  parameters: { layout: "centered" },
  args: {
    isFavorite: false,
    onToggle: () => {},
  },
} satisfies Meta<typeof FavoriteStar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Favorited: Story = {
  args: {
    isFavorite: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
        <FavoriteStar key={size} isFavorite onToggle={() => {}} size={size} />
      ))}
    </div>
  ),
};
