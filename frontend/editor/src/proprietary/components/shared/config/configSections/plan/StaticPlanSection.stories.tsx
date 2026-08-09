import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import StaticPlanSection from "@app/components/shared/config/configSections/plan/StaticPlanSection";
import type { LicenseInfo } from "@app/services/licenseService";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { LicenseProvider } from "@app/contexts/LicenseContext";

/**
 * The plan page shown when Stripe-backed checkout is unavailable — no Supabase
 * configuration, or the live plans request failed. It lists the three tiers from
 * hardcoded copy rather than fetched pricing, so the only thing that changes
 * what it renders is the licence it is handed.
 *
 * Each card's action is derived from that licence's tier: the current tier gets
 * "Manage", anything below it collapses to "Included", and Enterprise stays
 * blocked until a Server licence exists. The stories below walk that ladder,
 * since the button logic is the substance of the component.
 *
 * The embedded licence-key panel and checkout modal both call useLicense(),
 * which throws outside a provider. LicenseProvider is mounted with a non-admin
 * config so it settles without issuing a licence request of its own — the tier
 * on screen comes from the prop, not from the context.
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

const freeLicence: LicenseInfo = {
  licenseType: "NORMAL",
  enabled: false,
  maxUsers: 5,
  hasKey: false,
};

const serverLicence: LicenseInfo = {
  licenseType: "SERVER",
  enabled: true,
  maxUsers: 0,
  hasKey: true,
  licenseKey: "STORY-LICENCE-2222-2222-2222",
};

const enterpriseLicence: LicenseInfo = {
  licenseType: "ENTERPRISE",
  enabled: true,
  maxUsers: 250,
  hasKey: true,
  licenseKey: "file:/opt/stirling/licence.cert",
};

const meta = {
  title: "Config/Plan/StaticPlanSection",
  component: StaticPlanSection,
  parameters: { layout: "padded" },
  decorators: [withLicenseContext],
} satisfies Meta<typeof StaticPlanSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Free tier: Free is the current plan, Server offers an upgrade, Enterprise is gated behind it. */
export const FreeTier: Story = {
  args: { currentLicenseInfo: freeLicence },
};

/** Server licence: Free collapses to "Included", Server offers billing management, Enterprise asks for contact. */
export const ServerTier: Story = {
  args: { currentLicenseInfo: serverLicence },
};

/** Enterprise licence: both lower tiers collapse to "Included" and only Enterprise is manageable. */
export const EnterpriseTier: Story = {
  args: { currentLicenseInfo: enterpriseLicence },
};

/**
 * Licence details not supplied at all — the tier is indeterminate, so Free is
 * marked current but the paid cards resolve to no action rather than an
 * upgrade path. Worth keeping visible: it is what an admin briefly sees while
 * licence info is still resolving.
 */
export const LicenceUnknown: Story = {};
