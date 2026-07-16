import type { Meta, StoryObj } from "@storybook/react-vite";
import { ClassificationLabelsSection } from "@portal/components/policies/ClassificationLabelsSection";

const meta: Meta<typeof ClassificationLabelsSection> = {
  title: "Portal/Policies/ClassificationLabelsSection",
  component: ClassificationLabelsSection,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ClassificationLabelsSection>;

export const Default: Story = {};
