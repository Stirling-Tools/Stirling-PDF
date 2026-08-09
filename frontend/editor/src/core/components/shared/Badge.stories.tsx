import type { Meta, StoryObj } from "@storybook/react-vite";
import Badge from "@app/components/shared/Badge";

/** Small inline label. `colored` takes an explicit palette so callers can tint
 *  a badge to whatever the surrounding feature already uses. */
const meta: Meta<typeof Badge> = {
  title: "Shared/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  args: { children: "Beta" },
};
export default meta;

type Story = StoryObj<typeof Badge>;

/** Default tone. */
export const Default: Story = {};

/** The three sizes together, so their baselines can be compared. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

/** Explicitly tinted. The pairing is the caller's to get right — these use the
 *  semantic tokens rather than raw hues so they hold up in both themes. */
export const Colored: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <Badge
        variant="colored"
        backgroundColor="var(--c-success-solid)"
        textColor="var(--c-text-on-primary)"
      >
        Active
      </Badge>
      <Badge
        variant="colored"
        backgroundColor="var(--c-warning-solid)"
        textColor="var(--c-text-on-primary)"
      >
        Pending
      </Badge>
      <Badge
        variant="colored"
        backgroundColor="var(--c-danger-solid)"
        textColor="var(--c-text-on-primary)"
      >
        Failed
      </Badge>
    </div>
  ),
};

/** A long label, to check it stays on one line rather than breaking the row. */
export const LongLabel: Story = {
  args: { children: "Requires the AI engine" },
};

/** A numeral, the other common use. */
export const Count: Story = { args: { children: "12", size: "sm" } };
