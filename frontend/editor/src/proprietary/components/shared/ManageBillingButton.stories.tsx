import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import { ManageBillingButton } from "@app/components/shared/ManageBillingButton";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { LicenseProvider } from "@app/contexts/LicenseContext";

/**
 * Button that opens the Stripe billing portal for the current license.
 */
const meta = {
  title: "Shared/ManageBillingButton",
  component: ManageBillingButton,
  parameters: {
    layout: "centered",
    msw: {
      handlers: [
        http.get("*/api/v1/admin/license-info", () =>
          HttpResponse.json({
            licenseType: "SERVER",
            enabled: true,
            maxUsers: 0,
            hasKey: true,
            licenseKey: "storybook-server-license",
          }),
        ),
        http.post("http://billing.mock/functions/v1/manage-billing", () =>
          HttpResponse.json({ url: "https://example.com/billing" }),
        ),
      ],
    },
  },
  decorators: [
    (Story) => (
      <AppConfigProvider autoFetch={false} initialConfig={{ isAdmin: true }}>
        <LicenseProvider>
          <Story />
        </LicenseProvider>
      </AppConfigProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", {
        name: "Manage Billing",
      }),
    ).toBeVisible();
  },
} satisfies Meta<typeof ManageBillingButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Custom return URL to redirect back to once the billing portal session ends. */
export const CustomReturnUrl: Story = {
  args: {
    returnUrl: "https://stirlingpdf.com/account",
  },
};
