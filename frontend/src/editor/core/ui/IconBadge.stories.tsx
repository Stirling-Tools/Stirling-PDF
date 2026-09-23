import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import { IconBadge } from "@app/ui/IconBadge";

function Glyph() {
  return <Icon name="star" size={16} />;
}

const meta: Meta<typeof IconBadge> = {
  title: "Primitives/IconBadge",
  component: IconBadge,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { accent: "blue", size: "md", children: <Glyph /> },
  argTypes: {
    accent: {
      control: "inline-radio",
      options: ["blue", "purple", "green", "amber", "red"],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
};
export default meta;
type Story = StoryObj<typeof IconBadge>;

export const Blue: Story = {};
export const Accents: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12 }}>
      {(["blue", "purple", "green", "amber", "red"] as const).map((a) => (
        <IconBadge key={a} accent={a}>
          <Glyph />
        </IconBadge>
      ))}
    </div>
  ),
};
