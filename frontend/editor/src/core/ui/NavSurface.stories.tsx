import type { Meta, StoryObj } from "@storybook/react-vite";
import { NavSurface } from "@app/ui/NavSurface";
import { NavItem } from "@app/ui/NavItem";

function Dot() {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        background: "var(--c-primary)",
        display: "inline-block",
      }}
    />
  );
}

const meta: Meta<typeof NavSurface> = {
  title: "Primitives/NavSurface",
  component: NavSurface,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ width: "15rem", background: "var(--c-bg)", padding: 12 }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof NavSurface>;

/** The box a sidebar's rows sit in. */
export const Default: Story = {
  args: {
    children: (
      <div style={{ padding: "0.5rem 0" }}>
        <NavItem id="home" label="Home" icon={<Dot />} isActive />
        <NavItem id="sources" label="Sources" icon={<Dot />} />
        <NavItem id="documents" label="Documents" icon={<Dot />} />
      </div>
    ),
  },
};

/** `as` renders a landmark element instead of a div. */
export const AsSection: Story = {
  args: {
    as: "section",
    "aria-label": "Processor",
    children: (
      <div style={{ padding: "0.75rem" }}>
        <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
          Any content, not just nav rows.
        </span>
      </div>
    ),
  },
};
