import type { Meta, StoryObj } from "@storybook/react-vite";
import { decorateForStory } from "@portal/components/policies/storyFixtures";
import { PolicyDetailPanel } from "@portal/components/policies/PolicyDetailPanel";

const meta: Meta<typeof PolicyDetailPanel> = {
  title: "Portal/Policies/PolicyDetailPanel",
  component: PolicyDetailPanel,
  parameters: { layout: "fullscreen" },
  args: {
    onClose: () => {},
    onEdit: () => {},
    onRun: () => {},
    onTogglePause: () => {},
    onDelete: () => {},
    onRetry: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PolicyDetailPanel>;

/** An active built-in policy — Delete is hidden (default policies aren't deletable). */
export const Active: Story = {
  args: { policy: decorateForStory("security") },
};

/** A paused policy — the action reads "Resume". */
export const Paused: Story = {
  args: {
    policy: {
      ...decorateForStory("security"),
      state: { ...decorateForStory("security").state, status: "paused" },
    },
  },
};

/** A custom (deletable) policy with no runs yet — empty activity feed. */
export const CustomNoActivity: Story = {
  args: {
    policy: {
      ...decorateForStory("security"),
      state: { ...decorateForStory("security").state, isDefault: false },
      activity: [],
      stats: { enforced: 0, dataProcessed: "0 B", activeFor: "—" },
    },
  },
};

/** Flagged activity items — shows retry button and error expansion. */
export const WithFlaggedItems: Story = {
  args: {
    policy: {
      ...decorateForStory("security"),
      state: { ...decorateForStory("security").state, isDefault: false },
      activity: [
        {
          doc: "Q4-Report.pdf",
          action: "Low-confidence match — routed for review",
          time: "2h ago",
          status: "flagged",
        },
        {
          doc: "Contract-2026.pdf",
          action:
            "Enforcement failed: timeout after 30s — step 2/3 (redact) did not complete within the allowed window. Check the document for unusual formatting or large embedded images.",
          time: "4h ago",
          status: "flagged",
        },
        {
          doc: "Invoice-March.pdf",
          action: "Enforced successfully",
          time: "6h ago",
          status: "enforced",
        },
        {
          doc: "HR-Policy-v3.pdf",
          action: "Processing…",
          time: "just now",
          status: "processing",
        },
      ],
    },
  },
};
