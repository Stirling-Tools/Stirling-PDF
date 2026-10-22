import type { Meta, StoryObj } from "@storybook/react-vite";
import WelcomeSlide from "@app/components/onboarding/slides/WelcomeSlide";

// WelcomeSlide is a slide-content factory (returns a SlideConfig), not
// a component, so wrap it to render its `title`/`body` the way the real
// onboarding shell does.
function WelcomeSlideDemo() {
  const slide = WelcomeSlide();

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
      <div style={{ color: "#fff" }}>{slide.body}</div>
    </div>
  );
}

const meta = {
  title: "Onboarding/WelcomeSlide",
  component: WelcomeSlideDemo,
} satisfies Meta<typeof WelcomeSlideDemo>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {} };
