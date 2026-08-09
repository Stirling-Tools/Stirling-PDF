import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyEnforcingOverlay } from "@app/components/shared/PolicyEnforcingOverlay";

/**
 * The frosted-glass cover shown over a document while a policy runs against it.
 * It fills its nearest positioned ancestor, so it serves both the full-screen
 * viewer and a single thumbnail card.
 *
 * What changes between states: whether the run reports step counts (a
 * determinate progress bar) or not (a spinner); whether the caller allows the
 * user through anyway (the dismiss button); and which policy is enforcing —
 * the accent colour and category icon are passed in so the overlay matches that
 * policy's badge instead of a fixed blue shield. `enforcing: false` renders
 * nothing at all, so it isn't a story.
 */
const meta: Meta<typeof PolicyEnforcingOverlay> = {
  title: "Shared/PolicyEnforcingOverlay",
  component: PolicyEnforcingOverlay,
  parameters: { layout: "padded" },
  args: { enforcing: true },
  decorators: [
    (S) => (
      // Stands in for the surface being covered — the overlay needs a
      // positioned ancestor with real dimensions to render into.
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "34rem",
          height: "22rem",
          borderRadius: "0.5rem",
          border: "1px solid var(--c-border)",
          background: "var(--c-surface)",
          overflow: "hidden",
        }}
      >
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PolicyEnforcingOverlay>;

/** A run with no step counts: an indeterminate spinner and the generic shield. */
export const Indeterminate: Story = {};

/** A run that reports its steps swaps the spinner for a determinate bar. */
export const WithProgress: Story = {
  args: { progress: 62 },
};

/** Callers that let the user look at the file anyway get a dismiss button. */
export const Dismissible: Story = {
  args: { progress: 40, onDismiss: () => {} },
};

/**
 * Tinted to the enforcing policy: the classification category's label icon and
 * its badge colour replace the default shield and blue.
 */
export const ClassificationPolicy: Story = {
  args: {
    progress: 30,
    categoryId: "classification",
    accentVar: "var(--color-orange)",
  },
};
