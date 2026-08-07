import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";
import { PolicyEnforcementOverlay } from "@app/components/viewer/PolicyEnforcementOverlay";

const run = (over: Partial<PolicyRunRecord> = {}): PolicyRunRecord => ({
  runId: "run-1",
  categoryId: "security",
  fileId: "file-1",
  fileName: "contract-2026.pdf",
  fileSize: 248_000,
  target: "local",
  status: "RUNNING",
  outputs: [],
  error: null,
  startedAt: 0,
  ...over,
});

/**
 * The viewer's policy banner. It picks the first in-flight run out of the run
 * list and shows the enforcement overlay for it, tinted to that policy's
 * accent — so which run it selects, and whether one is in flight at all, is
 * the whole behaviour.
 */
const meta: Meta<typeof PolicyEnforcementOverlay> = {
  title: "Proprietary/Viewer/PolicyEnforcementOverlay",
  component: PolicyEnforcementOverlay,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          width: 460,
          height: 300,
          border: "1px solid var(--c-border)",
          borderRadius: 8,
          background: "var(--c-surface)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem", color: "var(--c-text-muted)" }}>
          The document sits beneath the overlay.
        </div>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PolicyEnforcementOverlay>;

/** A policy running with no step counts to report. */
export const Running: Story = { args: { runs: [run()] } };

/** Reporting progress through its steps. */
export const WithSteps: Story = {
  args: { runs: [run({ currentStep: 2, stepCount: 5 })] },
};

/** Queued but not started. */
export const Pending: Story = { args: { runs: [run({ status: "PENDING" })] } };

/** Waiting on the user before it can continue. */
export const WaitingForInput: Story = {
  args: { runs: [run({ status: "WAITING_FOR_INPUT" })] },
};

/** A different policy category, which changes the accent the overlay uses. */
export const ComplianceCategory: Story = {
  args: {
    runs: [run({ categoryId: "compliance", currentStep: 1, stepCount: 3 })],
  },
};

/** Several runs, only one of them in flight — that is the one shown. */
export const PicksTheInFlightRun: Story = {
  args: {
    runs: [
      run({ runId: "done-1", status: "COMPLETED" }),
      run({ runId: "failed-1", status: "FAILED", error: "Timed out" }),
      run({ runId: "live-1", currentStep: 3, stepCount: 4 }),
    ],
  },
};

/** Nothing in flight — the overlay stays out of the way. */
export const NothingRunning: Story = {
  args: { runs: [run({ status: "COMPLETED" })] },
};

/** No runs at all. */
export const NoRuns: Story = { args: { runs: [] } };
