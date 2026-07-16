import type { Meta, StoryObj } from "@storybook/react";
import LoginRightCarousel from "@app/auth/ui/LoginRightCarousel";
import { buildDefaultLoginSlides } from "@app/auth/ui/loginSlides";

/**
 * The animated image carousel shown on the right-hand panel of the login screen
 */
const meta: Meta<typeof LoginRightCarousel> = {
  title: "Auth/Login Right Carousel",
  component: LoginRightCarousel,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof LoginRightCarousel>;

export const Default: Story = {
  render: (args) => (
    <div style={{ width: 480, height: 640 }}>
      <LoginRightCarousel {...args} imageSlides={buildDefaultLoginSlides()} />
    </div>
  ),
};

export const NoBackground: Story = {
  render: (args) => (
    <div style={{ width: 480, height: 640 }}>
      <LoginRightCarousel
        {...args}
        imageSlides={buildDefaultLoginSlides()}
        showBackground={false}
      />
    </div>
  ),
};

export const NoSlides: Story = {
  render: (args) => (
    <div style={{ width: 480, height: 640 }}>
      <LoginRightCarousel {...args} imageSlides={[]} />
    </div>
  ),
};
