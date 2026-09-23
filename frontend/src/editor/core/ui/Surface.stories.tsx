import type { Meta, StoryObj } from "@storybook/react-vite";
import { Surface } from "@app/ui/Surface";

const meta: Meta<typeof Surface> = {
  title: "Primitives/Surface",
  component: Surface,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ width: "22rem", background: "var(--c-bg)", padding: 12 }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Surface>;

/** The box any in-page panel, tile or table container sits in. */
export const Default: Story = {
  args: {
    children: (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Panel title</div>
        <div style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
          Same fill, border and radius on every surface.
        </div>
      </div>
    ),
  },
};

/** `as` renders a landmark element instead of a div. */
export const AsSection: Story = {
  args: {
    as: "section",
    "aria-label": "Usage",
    children: (
      <div style={{ padding: "0.75rem" }}>
        <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
          Any content, not just cards.
        </span>
      </div>
    ),
  },
};
