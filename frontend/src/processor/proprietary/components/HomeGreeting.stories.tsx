import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeGreeting } from "@portal/components/HomeGreeting";

const meta = {
  title: "Portal/Home/HomeGreeting",
  component: HomeGreeting,
} satisfies Meta<typeof HomeGreeting>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Time-of-day greeting + today's date, shown above the paid-tier home hero. */
export const Default: Story = {};
