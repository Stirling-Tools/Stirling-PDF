import type { Meta, StoryObj } from "@storybook/react-vite";
import PlanOverviewSlide from "@app/components/onboarding/slides/PlanOverviewSlide";
import type { LicenseNotice } from "@app/types/types";

interface PlanOverviewStageProps {
  isAdmin: boolean;
  licenseNotice?: LicenseNotice;
  loginEnabled?: boolean;
}

// PlanOverviewSlide is a factory that returns a SlideConfig (title/body nodes
// plus background config), not JSX itself, so this stage renders the pieces
// it produces the same way OnboardingModalSlide does in the real flow.
function PlanOverviewStage({
  isAdmin,
  licenseNotice,
  loginEnabled,
}: PlanOverviewStageProps) {
  const slide = PlanOverviewSlide({ isAdmin, licenseNotice, loginEnabled });
  return (
    <div style={{ maxWidth: 480, padding: 24 }}>
      <h2>{slide.title}</h2>
      <div>{slide.body}</div>
    </div>
  );
}

const meta = {
  title: "Onboarding/Slides/PlanOverviewSlide",
  component: PlanOverviewStage,
} satisfies Meta<typeof PlanOverviewStage>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Regular user overview — no admin controls, no free-tier notice. */
export const Default: Story = {
  args: { isAdmin: false },
};

/** Admin overview with login mode already enabled. */
export const AdminLoginEnabled: Story = {
  args: {
    isAdmin: true,
    loginEnabled: true,
    licenseNotice: {
      totalUsers: 3,
      freeTierLimit: 5,
      isOverLimit: false,
      requiresLicense: false,
    },
  },
};

/** Admin overview before login mode is enabled — different body copy. */
export const AdminLoginDisabled: Story = {
  args: {
    isAdmin: true,
    loginEnabled: false,
  },
};
