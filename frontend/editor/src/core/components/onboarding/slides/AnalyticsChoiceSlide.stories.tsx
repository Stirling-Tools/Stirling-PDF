import type { Meta, StoryObj } from "@storybook/react-vite";
import AnalyticsChoiceSlide from "@app/components/onboarding/slides/AnalyticsChoiceSlide";

// AnalyticsChoiceSlide is a slide-content factory (returns a SlideConfig), not
// a component, so wrap it to render its `body` the way the real onboarding
// shell does.
function AnalyticsChoiceSlideDemo({
  analyticsError = null,
}: {
  analyticsError?: string | null;
}) {
  const slide = AnalyticsChoiceSlide({ analyticsError });

  return (
    <div
      style={{
        maxWidth: 420,
        padding: 24,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${slide.background.gradientStops[0]}, ${slide.background.gradientStops[1]})`,
      }}
    >
      <h2 style={{ color: "#fff" }}>{slide.title}</h2>
      {slide.body}
    </div>
  );
}

const meta = {
  title: "Onboarding/AnalyticsChoiceSlide",
  component: AnalyticsChoiceSlideDemo,
} satisfies Meta<typeof AnalyticsChoiceSlideDemo>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {} };

export const WithError: Story = {
  args: { analyticsError: "Failed to save your analytics preference." },
};
