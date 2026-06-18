import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyDetailPanel } from "@app/components/policies/PolicyDetailPanel";
import { PoliciesSection } from "@app/components/policies/PoliciesSidebar";
import { POLICY_CATEGORIES, POLICY_CONFIG } from "@app/data/policyDefinitions";
import type { PolicyActivityItem, PolicyStats } from "@app/types/policies";
import "@app/components/policies/Policies.css";

/**
 * The Policies surface lives in the editor's right tool sidebar. These stories
 * render the three rich detail surfaces (narrative / setup wizard / settings)
 * inside a frame the width of the rail when a policy is open (25rem), so the
 * SUI composition can be reviewed in isolation — no app shell, login, or
 * backend required. Toggle the Storybook theme switcher to check dark mode.
 */
const RAIL_WIDTH = "25rem";

/** Frame that mimics the right rail's open width + surface so the panel reads true. */
function RailFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: RAIL_WIDTH,
        height: "780px",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

const ingestion = POLICY_CATEGORIES.find((c) => c.id === "ingestion")!;
const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;

// Illustrative activity/stats for the static stories. In the app these are
// derived live from the user's real uploaded files (see policyLiveData).
const sampleActivity: PolicyActivityItem[] = [
  {
    doc: "MSA_Acme_2026.pdf",
    action: "1.2 MB • enforced on upload",
    time: "2h ago",
    status: "enforced",
  },
  {
    doc: "scan_002.pdf",
    action: "Low confidence • flagged for review",
    time: "Yesterday",
    status: "flagged",
  },
];
const sampleStats: PolicyStats = {
  enforced: 1284,
  dataProcessed: "3.2 GB",
  activeFor: "18d",
};

const noop = () => {};

const meta: Meta = {
  title: "Editor/Policies",
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj;

/** Configured policy, running — Enforces / Activity / Stats narrative. */
export const DetailActive: Story = {
  render: () => (
    <RailFrame>
      <PolicyDetailPanel
        category={ingestion}
        config={POLICY_CONFIG.ingestion}
        status="active"
        steps={POLICY_CONFIG.ingestion.defaultOperations}
        activity={[
          {
            doc: "Q4_Report.pdf",
            action: "Enforcing…",
            time: "Just now",
            status: "processing",
          },
          ...sampleActivity,
        ]}
        stats={sampleStats}
        canConfigure
        canDelete
        onBack={noop}
        onEditSettings={noop}
        onTogglePause={noop}
        onDelete={noop}
      />
    </RailFrame>
  ),
};

/** Configured policy, paused — amber accent + warning badge. */
export const DetailPaused: Story = {
  render: () => (
    <RailFrame>
      <PolicyDetailPanel
        category={security}
        config={POLICY_CONFIG.security}
        status="paused"
        activity={sampleActivity}
        stats={sampleStats}
        canConfigure
        canDelete
        onBack={noop}
        onEditSettings={noop}
        onTogglePause={noop}
        onDelete={noop}
      />
    </RailFrame>
  ),
};

/** Read-only view for a member without configure permission. */
export const DetailManaged: Story = {
  render: () => (
    <RailFrame>
      <PolicyDetailPanel
        category={ingestion}
        config={POLICY_CONFIG.ingestion}
        status="active"
        activity={sampleActivity}
        stats={sampleStats}
        canConfigure={false}
        canDelete={false}
        onBack={noop}
        onEditSettings={noop}
        onTogglePause={noop}
        onDelete={noop}
      />
    </RailFrame>
  ),
};

/** The policy list section (above Tools). */
export const ListSection: Story = {
  render: () => (
    <div
      style={{
        width: RAIL_WIDTH,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-2) 0",
      }}
    >
      <PoliciesSection />
    </div>
  ),
};

// The setup + edit wizard embeds the Watch Folders automation builder (its
// Workflow step), which needs the ToolWorkflow context - so the wizard is
// exercised in-app, not via an isolated story here.
