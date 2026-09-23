import type { Meta, StoryObj } from "@storybook/react-vite";
import { OverviewHeader } from "@app/components/shared/config/OverviewHeader";

const meta = {
  title: "Shared/Config/OverviewHeader",
  component: OverviewHeader,
  parameters: { layout: "padded" },
} satisfies Meta<typeof OverviewHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
