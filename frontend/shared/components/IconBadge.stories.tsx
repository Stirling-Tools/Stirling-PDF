import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconBadge } from "@shared/components/IconBadge";

function Glyph() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
    </svg>
  );
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
