import type { Meta, StoryObj } from "@storybook/react-vite";
import { WelcomeCarousel } from "@portal/components/WelcomeCarousel";

const meta: Meta<typeof WelcomeCarousel> = {
  title: "Portal/Home/WelcomeCarousel",
  component: WelcomeCarousel,
  args: { onTryOp: () => console.log("try op") },
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "64rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof WelcomeCarousel>;

export const AutoRotating: Story = {};
