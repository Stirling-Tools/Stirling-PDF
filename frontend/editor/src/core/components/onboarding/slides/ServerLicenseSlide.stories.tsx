import type { Meta, StoryObj } from "@storybook/react-vite";
import ServerLicenseSlide from "@app/components/onboarding/slides/ServerLicenseSlide";
import type { LicenseNotice } from "@app/types/types";

interface ServerLicenseStageProps {
  licenseNotice?: LicenseNotice;
}

// ServerLicenseSlide is a factory that returns a SlideConfig (title/body nodes
// plus background config), not JSX itself, so this stage renders those pieces
// directly to preview the slide in isolation.
function ServerLicenseStage({ licenseNotice }: ServerLicenseStageProps) {
  const slide = ServerLicenseSlide({ licenseNotice });
  return (
    <div
      style={{
        maxWidth: 480,
        padding: 24,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${slide.background.gradientStops[0]}, ${slide.background.gradientStops[1]})`,
      }}
    >
      <h2 style={{ color: "#fff" }}>{slide.title}</h2>
      <div style={{ color: "#fff" }}>{slide.body}</div>
    </div>
  );
}

const meta = {
  title: "Onboarding/Slides/ServerLicenseSlide",
  component: ServerLicenseStage,
} satisfies Meta<typeof ServerLicenseStage>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Default free-tier notice — under the limit. */
export const Default: Story = {
  args: {},
};

/** Under the free-tier limit with a known user count. */
export const UnderLimit: Story = {
  args: {
    licenseNotice: {
      totalUsers: 3,
      freeTierLimit: 5,
      isOverLimit: false,
      requiresLicense: false,
    },
  },
};

/** Over the free-tier limit — prompts to upgrade with a different gradient. */
export const OverLimit: Story = {
  args: {
    licenseNotice: {
      totalUsers: 12,
      freeTierLimit: 5,
      isOverLimit: true,
      requiresLicense: true,
    },
  },
};
