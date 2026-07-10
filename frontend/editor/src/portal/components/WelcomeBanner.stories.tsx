import type { Meta, StoryObj } from "@storybook/react-vite";
import { WelcomeBanner } from "@portal/components/WelcomeBanner";
import { SetupChecklist } from "@portal/components/SetupChecklist";
import type { OnboardingProgress } from "@portal/hooks/useOnboardingProgress";

const progress: OnboardingProgress = {
  loading: false,
  deployed: false,
  editorDone: false,
  policiesDone: true,
  inviteDone: false,
  policiesActive: 2,
  policiesRecommended: 5,
  allComplete: false,
};

const meta: Meta<typeof WelcomeBanner> = {
  title: "Portal/Home/WelcomeBanner",
  component: WelcomeBanner,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof WelcomeBanner>;

/** The hero on its own, no attached footer. */
export const Default: Story = {};

/** The hero as it renders on the free-tier home: the "Finish setting up"
 *  checklist attached as the footer strip. */
export const WithSetupChecklist: Story = {
  args: {
    footer: <SetupChecklist progress={progress} />,
  },
};
