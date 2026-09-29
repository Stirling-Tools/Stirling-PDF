import type { Meta, StoryObj } from "@storybook/react-vite";
import FirstLoginSlide from "@app/components/onboarding/slides/FirstLoginSlide";

// FirstLoginSlide is a slide-content factory (returns a SlideConfig), not a
// component, so wrap it to render its `body` the way the real onboarding shell
// does.
function FirstLoginSlideDemo({
  username = "admin",
  usingDefaultCredentials = false,
}: {
  username?: string;
  usingDefaultCredentials?: boolean;
}) {
  const slide = FirstLoginSlide({
    username,
    onPasswordChanged: () => {},
    usingDefaultCredentials,
  });

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
  title: "Onboarding/FirstLoginSlide",
  component: FirstLoginSlideDemo,
} satisfies Meta<typeof FirstLoginSlideDemo>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { username: "admin" } };

export const UsingDefaultCredentials: Story = {
  args: { username: "admin", usingDefaultCredentials: true },
};
