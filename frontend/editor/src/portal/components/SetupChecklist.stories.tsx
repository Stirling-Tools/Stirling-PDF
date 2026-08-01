import type { Meta, StoryObj } from "@storybook/react-vite";
import { SetupChecklist } from "@portal/components/SetupChecklist";
import type { OnboardingProgress } from "@portal/hooks/useOnboardingProgress";

const base: OnboardingProgress = {
  loading: false,
  deployed: false,
  editorDone: false,
  policiesDone: false,
  inviteDone: false,
  policiesActive: 0,
  policiesRecommended: 6,
  allComplete: false,
};

const meta: Meta<typeof SetupChecklist> = {
  title: "Portal/Home/SetupChecklist",
  component: SetupChecklist,
  parameters: { layout: "padded" },
  args: { progress: base },
  decorators: [
    (S) => (
      <div
        style={{
          maxWidth: "60rem",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          background: "var(--c-surface)",
        }}
      >
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SetupChecklist>;

/** A fresh workspace — no step complete yet. */
export const NotStarted: Story = {};

/** Policies confirmed; editor + invite still open. */
export const InProgress: Story = {
  args: {
    progress: {
      ...base,
      policiesDone: true,
      policiesActive: 2,
      policiesRecommended: 5,
    },
  },
};

/** Editor deployed + policies on; only the invite step remains. */
export const AlmostDone: Story = {
  args: {
    progress: {
      ...base,
      editorDone: true,
      policiesDone: true,
      policiesActive: 4,
      policiesRecommended: 3,
    },
  },
};
