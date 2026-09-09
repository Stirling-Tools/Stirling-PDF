import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof SectionHeader> = {
  title: "Portal/Infrastructure/SectionHeader",
  component: SectionHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SectionHeader>;

export const Default: Story = {
  args: {
    title: "Regions",
    sub: "Live health for every deployed Stirling region — latency, load, and rollout version.",
  },
};

export const ShortSub: Story = {
  args: { title: "API keys", sub: "Scoped credentials." },
};
