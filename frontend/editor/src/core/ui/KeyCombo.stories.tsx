import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeyCombo } from "@app/ui/KeyCombo";

const meta: Meta<typeof KeyCombo> = {
  title: "Primitives/KeyCombo",
  component: KeyCombo,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { combo: "Ctrl + Shift + V" },
};
export default meta;
type Story = StoryObj<typeof KeyCombo>;

export const Default: Story = {};

export const WithPlus: Story = {
  args: { combo: "Ctrl + S", withPlus: true },
};

/** Alternatives are separated by "/", never crammed into one cap. */
export const Alternatives: Story = {
  args: { combo: "F3 / Ctrl + G" },
};

/** Mouse gestures are keys too - they just happen to be words. */
export const Gestures: Story = {
  args: { combo: "Ctrl + Click + Drag" },
};

export const InContext_ShortcutList: Story = {
  render: () => (
    <div
      style={{
        width: "26rem",
        border: "1px solid var(--c-border-subtle)",
        borderRadius: "0.5rem",
        overflow: "hidden",
        background: "var(--c-surface-raised)",
      }}
    >
      {[
        ["Edit text", "Click"],
        ["Add / remove a run from selection", "Ctrl + Click / Shift + Click"],
        ["Marquee multi-select", "Ctrl + Shift + Drag"],
        ["Undo / Redo", "Ctrl + Z / Ctrl + Y"],
        ["Save to your workspace", "Ctrl + S"],
      ].map(([label, combo], index) => (
        <div
          key={combo}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "0.625rem 0.875rem",
            borderTop:
              index === 0 ? "none" : "1px solid var(--c-border-subtle)",
            color: "var(--c-text)",
            fontSize: "0.875rem",
          }}
        >
          <span>{label}</span>
          <KeyCombo combo={combo} />
        </div>
      ))}
    </div>
  ),
};
