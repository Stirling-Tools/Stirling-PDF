import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyDetailPanel } from "@app/components/policies/PolicyDetailPanel";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import { PolicySettingsForm } from "@app/components/policies/PolicySettingsForm";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  POLICY_SOURCES,
  POLICY_DOC_TYPES,
} from "@app/data/policyDefinitions";
import type { PolicyState } from "@app/types/policies";
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
const compliance = POLICY_CATEGORIES.find((c) => c.id === "compliance")!;

/** A configured, running policy. */
const activeState: PolicyState = {
  configured: true,
  status: "active",
  sources: ["editor", "device"],
  scopeTypes: [],
  reviewerEmail: "reviewer@acme.com",
  fieldValues: {},
  docsEnforced24h: 42,
  alerts24h: 1,
  lastEnforced: "2h ago",
};

/** A fresh, unconfigured policy (wizard entry state). */
const freshState: PolicyState = {
  configured: false,
  status: "default",
  sources: [],
  scopeTypes: [],
  reviewerEmail: "",
  fieldValues: {},
  docsEnforced24h: 0,
  alerts24h: 0,
  lastEnforced: null,
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
        state={activeState}
        status="active"
        steps={POLICY_CONFIG.ingestion.defaultOperations}
        canConfigure
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
        state={{ ...activeState, status: "paused" }}
        status="paused"
        canConfigure
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
        state={activeState}
        status="active"
        canConfigure={false}
        onBack={noop}
        onEditSettings={noop}
        onTogglePause={noop}
        onDelete={noop}
      />
    </RailFrame>
  ),
};

/** Three-step setup wizard (operations → sources/types → reviewer/confirm). */
export const Wizard: Story = {
  render: () => (
    <RailFrame>
      <PolicySetupWizard
        category={compliance}
        config={POLICY_CONFIG.compliance}
        initial={freshState}
        sources={POLICY_SOURCES}
        docTypes={POLICY_DOC_TYPES}
        canConfigure
        classificationEnabled={false}
        onCancel={noop}
        onEnable={noop}
        onSetupClassification={noop}
      />
    </RailFrame>
  ),
};

/** Edit-settings sub-view for a configured policy. */
export const Settings: Story = {
  render: () => (
    <RailFrame>
      <PolicySettingsForm
        category={ingestion}
        config={POLICY_CONFIG.ingestion}
        state={activeState}
        status="active"
        onCancel={noop}
        onClose={noop}
        onSave={noop}
      />
    </RailFrame>
  ),
};
