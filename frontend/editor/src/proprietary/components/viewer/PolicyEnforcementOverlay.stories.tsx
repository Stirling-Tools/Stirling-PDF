/**
 * Covers the viewer while a policy is still running against the open document.
 *
 * It is handed the whole run list and picks the first run that is still working
 * — queued, running, waiting for input, or sitting in a retry backoff. With no
 * such run it renders nothing, so settled runs are not a state worth showing.
 * Two things then decide what appears: whether that run reports step counts
 * (a determinate bar rather than a spinner), and which policy category is
 * enforcing, since the accent colour and icon follow that policy's badge.
 *
 * Dismissing collapses the cover to a corner badge so the document can be read
 * while the run finishes; the badge is internal state, reached by clicking.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "storybook/test";
import { PolicyEnforcementOverlay } from "@app/components/viewer/PolicyEnforcementOverlay";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

function run(overrides: Partial<PolicyRunRecord> = {}): PolicyRunRecord {
  return {
    runId: "run-1",
    categoryId: "security",
    fileId: "file-1",
    fileName: "contract.pdf",
    fileSize: 248_000,
    target: "saas",
    status: "RUNNING",
    outputs: [],
    error: null,
    startedAt: 1_780_000_000_000,
    ...overrides,
  };
}

const meta: Meta<typeof PolicyEnforcementOverlay> = {
  title: "Viewer/PolicyEnforcementOverlay",
  component: PolicyEnforcementOverlay,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      // Stands in for the document surface being covered: the overlay and the
      // collapsed badge both position themselves against the nearest
      // positioned ancestor, so they need one with real dimensions.
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

type Story = StoryObj<typeof PolicyEnforcementOverlay>;

/** A run under way with no step counts yet: an indeterminate spinner. */
export const Enforcing: Story = { args: { runs: [run()] } };

/** Once the run reports its steps, the spinner becomes a determinate bar. */
export const WithProgress: Story = {
  args: { runs: [run({ currentStep: 3, stepCount: 5 })] },
};

/**
 * A different policy category retints the whole cover — retention's red accent
 * and its own icon in place of the security shield.
 */
export const RetentionPolicy: Story = {
  args: {
    runs: [
      run({
        categoryId: "retention",
        runId: "run-2",
        currentStep: 1,
        stepCount: 4,
      }),
    ],
  },
};

/**
 * Dismissed while the run continues: the cover collapses to a corner badge,
 * inset from the corner itself so it never swallows the close button there.
 */
export const Dismissed: Story = {
  args: { runs: [run({ currentStep: 2, stepCount: 4 })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss overlay" }),
    );
  },
};
