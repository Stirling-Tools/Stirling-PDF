import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyEnforcingOverlay } from "@app/components/shared/PolicyEnforcingOverlay";

/**
 * Shown over a document while a policy runs against it. It renders into its
 * nearest positioned ancestor, so the stories supply one — the same thing the
 * viewer and the thumbnail cards do.
 *
 * `accentVar` exists so the spinner matches the enforcing policy's own badge
 * rather than a fixed blue; the stories cover the tones a policy can carry.
 */
const meta: Meta<typeof PolicyEnforcingOverlay> = {
  title: "Proprietary/Shared/PolicyEnforcingOverlay",
  component: PolicyEnforcingOverlay,
  parameters: { layout: "padded" },
  args: { enforcing: true },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          width: 420,
          height: 280,
          border: "1px solid var(--c-border)",
          borderRadius: 8,
          background: "var(--c-surface)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem", color: "var(--c-text-muted)" }}>
          Document content sits beneath the overlay.
        </div>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PolicyEnforcingOverlay>;

/** Running, with no step counts to report. */
export const Indeterminate: Story = {};

/** Part-way through a run that reports progress. */
export const WithProgress: Story = { args: { progress: 45 } };

/** Nearly done. */
export const AlmostComplete: Story = { args: { progress: 92 } };

/** Dismissable — the × only appears when a handler is given. */
export const Dismissable: Story = {
  args: { progress: 30, onDismiss: () => {} },
};

/** Tinted to the enforcing policy's accent. */
export const SecurityAccent: Story = {
  args: { progress: 60, accentVar: "var(--c-danger-solid)" },
};

/** A different policy tone. */
export const WarningAccent: Story = {
  args: { progress: 60, accentVar: "var(--c-warning-solid)" },
};

/** Not enforcing — the overlay renders nothing, leaving the document clear. */
export const NotEnforcing: Story = { args: { enforcing: false } };
