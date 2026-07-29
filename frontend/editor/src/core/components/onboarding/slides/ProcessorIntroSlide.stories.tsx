import type { Meta, StoryObj } from "@storybook/react-vite";
import ProcessorIntroSlide from "@app/components/onboarding/slides/ProcessorIntroSlide";

// ProcessorIntroSlide is a slide-content factory (returns a SlideConfig), not
// a component, so wrap it to render its `title`/`body` the way the real
// onboarding shell does.
function ProcessorIntroSlideDemo() {
  const slide = ProcessorIntroSlide();

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
  title: "Onboarding/ProcessorIntroSlide",
  component: ProcessorIntroSlideDemo,
} satisfies Meta<typeof ProcessorIntroSlideDemo>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {} };
