import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "@app/ui/Avatar";

const meta: Meta<typeof Avatar> = {
  title: "Primitives/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { name: "Harper Lee", size: "md", tone: "blue" },
  argTypes: {
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg"] },
    tone: {
      control: "inline-radio",
      options: ["blue", "purple", "green", "amber", "red", "neutral"],
    },
    onClick: { action: "clicked" },
  },
};
export default meta;
type Story = StoryObj<typeof Avatar>;

/** Flip name / size / tone / interactive in controls. */
export const Playground: Story = {};

export const SizeRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar name="A B" size="xs" />
      <Avatar name="A B" size="sm" />
      <Avatar name="A B" size="md" />
      <Avatar name="A B" size="lg" />
    </div>
  ),
};

const LOGO_INK = "#111827"; // theme-allow-color a user's uploaded file, which no token reaches

const TRANSPARENT_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
      `<path d="M128 32 L224 200 H32 Z" fill="${LOGO_INK}"/></svg>`,
  );

/** An uploaded logo keeps its own transparency: no tone disc behind it. */
export const WithPicture: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar name="Harper Lee" src={TRANSPARENT_LOGO} size="sm" />
      <Avatar name="Harper Lee" src={TRANSPARENT_LOGO} size="lg" />
      <Avatar name="Harper Lee" src={TRANSPARENT_LOGO} size="xl" />
    </div>
  ),
};

export const ToneRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      {(["blue", "purple", "green", "amber", "red", "neutral"] as const).map(
        (t) => (
          <Avatar key={t} name={t[0].toUpperCase()} tone={t} />
        ),
      )}
    </div>
  ),
};
