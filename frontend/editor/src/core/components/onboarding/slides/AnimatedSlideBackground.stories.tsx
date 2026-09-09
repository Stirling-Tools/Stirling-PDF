import type { Meta, StoryObj } from "@storybook/react-vite";
import AnimatedSlideBackground from "@app/components/onboarding/slides/AnimatedSlideBackground";
import type { AnimatedCircleConfig } from "@app/types/types";

const circles: AnimatedCircleConfig[] = [
  {
    size: 320,
    color: "rgba(255, 255, 255, 0.4)",
    position: "bottom-left",
    blur: 40,
  },
  {
    size: 220,
    color: "rgba(255, 255, 255, 0.3)",
    position: "top-right",
    opacity: 0.6,
    blur: 30,
  },
];

const meta = {
  title: "Onboarding/AnimatedSlideBackground",
  component: AnimatedSlideBackground,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AnimatedSlideBackground>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    gradientStops: ["#6E56CF", "#3B82F6"],
    circles,
    isActive: true,
    slideKey: "welcome",
  },
};

export const Inactive: Story = {
  args: {
    ...Default.args,
    isActive: false,
  },
};
