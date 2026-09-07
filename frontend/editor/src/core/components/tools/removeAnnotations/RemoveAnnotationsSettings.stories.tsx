import type { Meta, StoryObj } from "@storybook/react-vite";
import RemoveAnnotationsSettings from "@app/components/tools/removeAnnotations/RemoveAnnotationsSettings";

const meta = {
  title: "Tools/RemoveAnnotations/RemoveAnnotationsSettings",
  component: RemoveAnnotationsSettings,
} satisfies Meta<typeof RemoveAnnotationsSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
