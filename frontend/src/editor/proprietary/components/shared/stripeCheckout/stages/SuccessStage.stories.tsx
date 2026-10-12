import type { Meta, StoryObj } from "@storybook/react-vite";
import { SuccessStage } from "@app/components/shared/stripeCheckout/stages/SuccessStage";

/**
 * The success state shown after a Stripe checkout completes, including
 * license key polling and reveal.
 */
const meta = {
  title: "StripeCheckout/SuccessStage",
  component: SuccessStage,
  parameters: { layout: "centered" },
  args: {
    pollingStatus: "ready",
    currentLicenseKey: null,
    licenseKey: "STIRLING-XXXX-XXXX-XXXX-XXXX",
    onClose: () => {},
  },
} satisfies Meta<typeof SuccessStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Polling: Story = {
  args: {
    pollingStatus: "polling",
    currentLicenseKey: null,
    licenseKey: null,
  },
};

export const UpgradeComplete: Story = {
  args: {
    pollingStatus: "ready",
    currentLicenseKey: "STIRLING-EXISTING-KEY",
    licenseKey: null,
  },
};

export const Timeout: Story = {
  args: {
    pollingStatus: "timeout",
    currentLicenseKey: null,
    licenseKey: null,
  },
};
