import type { Meta, StoryObj } from "@storybook/react-vite";
import OperationButton from "@app/components/tools/shared/OperationButton";

/**
 * The run control every tool panel ends with. When it can't run it stays
 * visible and explains why rather than disappearing — the reason is what tells
 * the user what to fix.
 */
const meta: Meta<typeof OperationButton> = {
  title: "Tools/Shared/OperationButton",
  component: OperationButton,
  parameters: { layout: "padded" },
  args: { onClick: () => {}, submitText: "Rotate" },
};
export default meta;

type Story = StoryObj<typeof OperationButton>;

/** Ready to run. */
export const Default: Story = {};

/** Mid-run. */
export const Loading: Story = {
  args: { isLoading: true, loadingText: "Rotating…" },
};

/* ── Why it can't run ─────────────────────────────────────────────────────── */

/** No files chosen yet. */
export const NoFiles: Story = {
  args: { disabled: true, disabledReason: "noFiles" },
};

/** Files still hydrating. */
export const FilesLoading: Story = {
  args: { disabled: true, disabledReason: "filesLoading" },
};

/** Parameters incomplete or invalid. */
export const InvalidParams: Story = {
  args: { disabled: true, disabledReason: "invalidParams" },
};

/** The backend endpoint this tool needs is switched off. */
export const EndpointUnavailable: Story = {
  args: { disabled: true, disabledReason: "endpointUnavailable" },
};

/** Read-only viewer mode. */
export const ViewerMode: Story = {
  args: { disabled: true, disabledReason: "viewerMode" },
};

/** Disabled with no stated reason — the bare fallback. */
export const DisabledNoReason: Story = { args: { disabled: true } };

/* ── Appearance ───────────────────────────────────────────────────────────── */

/** Secondary weight, for a tool whose run isn't the primary action. */
export const Outline: Story = { args: { variant: "outline" } };

/** Lowest weight. */
export const Subtle: Story = { args: { variant: "subtle" } };

/** Destructive tools take the danger accent. */
export const Destructive: Story = {
  args: { color: "red", submitText: "Redact permanently" },
};

/** Spanning the panel. */
export const FullWidth: Story = { args: { fullWidth: true } };

/** Marked as running server-side, for tools that can't work purely locally. */
export const WithCloudBadge: Story = { args: { showCloudBadge: true } };
