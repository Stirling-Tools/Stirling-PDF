import type { Meta, StoryObj } from "@storybook/react-vite";
import { DrawingControls } from "@app/components/annotation/shared/DrawingControls";

const meta: Meta<typeof DrawingControls> = {
  title: "Annotation/DrawingControls",
  component: DrawingControls,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DrawingControls>;

export const Default: Story = {
  args: {
    onUndo: () => {},
    onRedo: () => {},
    onPlaceSignature: () => {},
    hasSignatureData: true,
    canUndo: true,
    canRedo: true,
  },
};

export const NoHistory: Story = {
  args: {
    onUndo: () => {},
    onRedo: () => {},
    onPlaceSignature: () => {},
    hasSignatureData: false,
    canUndo: false,
    canRedo: false,
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};
