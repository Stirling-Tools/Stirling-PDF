import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoBanner } from "@app/components/shared/InfoBanner";

const meta = {
  title: "Shared/InfoBanner",
  component: InfoBanner,
  parameters: { layout: "padded" },
} satisfies Meta<typeof InfoBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: "info-rounded",
    title: "Heads up",
    message: "This document contains form fields that will be flattened.",
  },
};

export const Warning: Story = {
  args: {
    tone: "warning",
    icon: "warning-rounded",
    title: "Action required",
    message: "Some pages could not be processed and were skipped.",
    buttonText: "Review",
    onButtonClick: () => {},
  },
};

export const Compact: Story = {
  args: {
    compact: true,
    icon: "info-rounded",
    message: "Autosave is enabled for this file.",
    dismissible: false,
  },
};
