import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CarouselDots } from "@app/ui/CarouselDots";

const meta: Meta<typeof CarouselDots> = {
  title: "Primitives/CarouselDots",
  component: CarouselDots,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { count: 3, activeIndex: 0, tone: "default" },
  argTypes: {
    count: { control: { type: "number", min: 2, max: 8 } },
    activeIndex: { control: { type: "number", min: 0, max: 7 } },
    tone: { control: "inline-radio", options: ["default", "onImage"] },
  },
};
export default meta;
type Story = StoryObj<typeof CarouselDots>;

/** Click a dot to move the active pill. */
export const Interactive: Story = {
  render: (args) => {
    const [index, setIndex] = useState(0);
    return (
      <CarouselDots
        {...args}
        activeIndex={index}
        onSelect={setIndex}
        label="Slides"
      />
    );
  },
};

/** Blue pill on a light surface (portal hero, light backgrounds). */
export const Default: Story = { args: { activeIndex: 1 } };

/** White dots for use over dark photography (auth carousel). */
export const OnImage: Story = {
  args: { activeIndex: 1, tone: "onImage" },
  decorators: [
    (S) => (
      <div style={{ background: "#1e293b", padding: "2rem", borderRadius: 12 }}>
        <S />
      </div>
    ),
  ],
};
