import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoBanner } from "@app/components/shared/InfoBanner";

const meta = {
  title: "Shared/InfoBanner",
  component: InfoBanner,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof InfoBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    icon: "info-rounded",
    title: "Heads up",
    message: "This document contains form fields that will be flattened.",
  },
};

export const Promo: Story = {
  args: {
    tone: "promo",
    icon: "stars-rounded",
    title: "Upgrade to Server Plan",
    message:
      "Get the most out of Stirling PDF with unlimited users and advanced features.",
    buttonText: "Upgrade Now",
    buttonIcon: "upgrade-rounded",
    onButtonClick: () => {},
    compact: true,
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

export const Danger: Story = {
  args: {
    tone: "danger",
    icon: "warning-rounded",
    title: "This server needs admin attention",
    message: "Review the license requirements to keep this server compliant.",
    buttonText: "See info",
    buttonIcon: "info-rounded",
    onButtonClick: () => {},
    dismissible: false,
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

/** Message-only, no title: the message takes the title's weight so the bar still reads. */
export const MessageOnly: Story = {
  args: {
    icon: "picture-as-pdf-rounded",
    message:
      "Make Stirling PDF your default application for opening PDF files.",
    buttonText: "Set Default",
    onButtonClick: () => {},
    secondaryButtonText: "Don't remind me again",
    onSecondaryButtonClick: () => {},
  },
};
