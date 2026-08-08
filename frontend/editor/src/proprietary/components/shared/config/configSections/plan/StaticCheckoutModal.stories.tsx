import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "storybook/test";
import StaticCheckoutModal from "@app/components/shared/config/configSections/plan/StaticCheckoutModal";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { LicenseProvider } from "@app/contexts/LicenseContext";

/**
 * The checkout used when Stripe is not wired into the app: it collects an email,
 * sends the buyer to a static Stripe payment link in a new tab, then waits for
 * them to paste back the licence key that arrives by email.
 *
 * The modal walks three stages held in local state (email → billing period →
 * licence activation), so only the first is reachable by props alone; the later
 * ones are driven through the form. `planName` and `isUpgrade` change nothing
 * but the heading — either one pointing at Enterprise produces the same title —
 * so there is one story per distinct heading rather than one per prop.
 *
 * Mantine renders the modal into a portal outside the story canvas, so the
 * queries below run against the document body.
 *
 * useLicense() throws outside a provider; LicenseProvider is mounted with a
 * non-admin config so it settles without issuing a licence request of its own.
 */
function withLicenseContext(Story: () => React.JSX.Element) {
  return (
    <AppConfigProvider
      autoFetch={false}
      bootstrapMode="non-blocking"
      initialConfig={{ enableLogin: true }}
    >
      <LicenseProvider>
        <Story />
      </LicenseProvider>
    </AppConfigProvider>
  );
}

const meta = {
  title: "Config/Plan/StaticCheckoutModal",
  component: StaticCheckoutModal,
  parameters: { layout: "centered" },
  args: {
    opened: true,
    onClose: () => {},
    planName: "server",
  },
  decorators: [withLicenseContext],
} satisfies Meta<typeof StaticCheckoutModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Buying a Server licence from the free tier — the opening email step. */
export const ServerLicence: Story = {};

/** Moving up to Enterprise, which reframes the same email step as an upgrade. */
export const EnterpriseUpgrade: Story = {
  args: { planName: "enterprise" },
};

/** A malformed address is rejected in place rather than advancing the flow. */
export const InvalidEmail: Story = {
  play: async () => {
    const body = within(document.body);
    await userEvent.type(body.getByRole("textbox"), "not-an-email{enter}");
  },
};

/**
 * Past the email step: the monthly/yearly choice, each option opening the
 * matching Stripe payment link.
 */
export const BillingPeriodChoice: Story = {
  play: async () => {
    const body = within(document.body);
    await userEvent.type(
      body.getByRole("textbox"),
      "jane@acme-legal.test{enter}",
    );
  },
};
