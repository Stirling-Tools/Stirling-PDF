import type { Meta, StoryObj } from "@storybook/react-vite";
import { BillingScreen } from "@app/billing/BillingScreen";
import { KvRow } from "@app/billing/KvRow";
import { InvoiceRow } from "@app/billing/InvoiceRow";
import { freeWallet, subscribedWallet } from "@app/billing/walletFixtures";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { ServerLicenseSection } from "@portal/components/billing/ServerLicenseSection";
import { http, HttpResponse } from "msw";

const meta: Meta<typeof BillingScreen> = {
  title: "Billing/BillingScreen",
  component: BillingScreen,
  parameters: { layout: "fullscreen" },
  args: { wallet: subscribedWallet },
};
export default meta;
type Story = StoryObj<typeof BillingScreen>;

export const SelfHostedLicense: Story = {
  args: {
    wallet: freeWallet,
    selfHosted: true,
    paymentSection: (
      <KvRow
        label="Payment method"
        value="No card on file"
        door={<button type="button">Update</button>}
      />
    ),
    licenseSection: <ServerLicenseSection onSaved={() => {}} />,
  },
  decorators: [
    (Story) => (
      <AppConfigProvider
        autoFetch={false}
        initialConfig={{ isAdmin: true, enableLogin: true }}
      >
        <LicenseProvider>
          <Story />
        </LicenseProvider>
      </AppConfigProvider>
    ),
  ],
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/admin/license-info", () =>
          HttpResponse.json({
            licenseType: "NORMAL",
            enabled: false,
            maxUsers: 5,
            licenseKey: "00000000-0000-0000-0000-000000000000",
          }),
        ),
        http.post("*/api/v1/admin/license-key", () =>
          HttpResponse.json({ success: true }),
        ),
        http.post("*/api/v1/admin/license-file", () =>
          HttpResponse.json({ success: true }),
        ),
      ],
    },
  },
};

export const SelfHostedLicenseDark: Story = {
  ...SelfHostedLicense,
  globals: { theme: "dark" },
};

export const SelfHostedInstalledLicense: Story = {
  ...SelfHostedLicense,
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/admin/license-info", () =>
          HttpResponse.json({
            licenseType: "ENTERPRISE",
            enabled: true,
            maxUsers: 100,
            licenseKey: "11111111-2222-3333-4444-555555555555",
          }),
        ),
        http.post("*/api/v1/admin/license-key", () =>
          HttpResponse.json({ success: true }),
        ),
        http.post("*/api/v1/admin/license-file", () =>
          HttpResponse.json({ success: true }),
        ),
      ],
    },
  },
};

export const SelfHostedCertificate: Story = {
  ...SelfHostedInstalledLicense,
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/admin/license-info", () =>
          HttpResponse.json({
            licenseType: "ENTERPRISE",
            enabled: true,
            maxUsers: 100,
            licenseKey: "file:/licenses/enterprise.lic",
          }),
        ),
      ],
    },
  },
};

export const SelfHostedLongCertificate: Story = {
  ...SelfHostedCertificate,
  render: (args) => (
    <div style={{ maxWidth: 375 }}>
      <BillingScreen {...args} />
    </div>
  ),
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/admin/license-info", () =>
          HttpResponse.json({
            licenseType: "ENTERPRISE",
            enabled: true,
            maxUsers: 100,
            licenseKey:
              "file:/licenses/01a09086ef667363b2d99f773dc4755aenterprise.lic",
          }),
        ),
      ],
    },
  },
};

/** Stand-ins for the host's sections, so the chip row and section rhythm can be reviewed. */
const payment = (
  <>
    <KvRow
      label="Payment method"
      value="Visa ending 4242 · expires 08 / 2027"
      door={<button type="button">Update</button>}
    />
    <KvRow
      label="Next invoice"
      note="from this cycle's pace"
      value="Oct 1 · $4,911.32"
    />
    <KvRow
      label="Billed to"
      value="Halcyon Legal"
      door={<button type="button">Update</button>}
    />
    <KvRow
      label="Invoices go to"
      value="matt@stirlingpdf.com"
      door={<button type="button">Update</button>}
    />
  </>
);
const invoices = (
  <>
    <InvoiceRow
      date="Sep 1, 2026"
      description="Team · 100 users"
      amount="$99.00"
      state="current"
      stateLabel="Current"
      href="https://example.invalid/i/1"
      viewLabel="View"
    />
    <InvoiceRow
      date="Aug 1, 2026"
      description="Team · 100 users"
      amount="$99.00"
      state="paid"
      stateLabel="Paid"
      href="https://example.invalid/i/2"
      viewLabel="View"
    />
    <InvoiceRow
      date="Jul 1, 2026"
      description="Team · 100 users"
      amount="$99.00"
      state="paid"
      stateLabel="Paid"
      href="https://example.invalid/i/3"
      viewLabel="View"
    />
  </>
);

/** Nothing bought, so both rows sell. */
export const Free: Story = {
  args: {
    wallet: {
      ...freeWallet,
      team: { held: false, licensedUsers: null, usersInUse: 1 },
      processor: { active: false },
      freeUserAllowance: 5,
    },
    onAddCapacity: () => {},
    onActivateProcessor: () => {},
    onEnterpriseQuote: () => {},
  },
};

/** Team bought, the Processor not. The identity carries no price, so the Users row does. */
export const TeamOnly: Story = {
  args: {
    wallet: {
      ...freeWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 6 },
      processor: { active: false },
    },
    onAddCapacity: () => {},
    onActivateProcessor: () => {},
    onEnterpriseQuote: () => {},
    editorsDeployed: 6,
    paymentSection: payment,
    invoicesSection: invoices,
  },
};

/** Both products: the identity carries the base, so Users says "included" and Processor governs. */
export const TeamAndProcessor: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 7 },
      processor: { active: true },
      estimatedBillMinor: 491_132,
      capUsd: 12_000,
      noCap: false,
    },
    onAddCapacity: () => {},
    onGovernSpend: () => {},
    onEnterpriseQuote: () => {},
    editorsDeployed: 6,
    paymentSection: payment,
    invoicesSection: invoices,
  },
};

/** Self-hosted and linked, carrying units the cloud has not billed yet. */
export const SelfHostedPendingSync: Story = {
  args: {
    selfHosted: true,
    wallet: {
      ...freeWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 62 },
      processor: { active: false },
    },
    pendingUnits: 148,
    onAddCapacity: () => {},
    onActivateProcessor: () => {},
    onEnterpriseQuote: () => {},
  },
};

/** Over capacity, reachable by a downgrade, a cancellation or a lapsed card. */
export const OverCapacity: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: 100, usersInUse: 137 },
      processor: { active: true },
    },
    onAddCapacity: () => {},
    onGovernSpend: () => {},
    onEnterpriseQuote: () => {},
    paymentSection: payment,
  },
};

/** A member: identical facts, no doors, because no action callbacks are passed. */
export const MemberReadOnly: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      role: "member",
      team: { held: true, licensedUsers: 100, usersInUse: 7 },
      processor: { active: true },
    },
  },
};

/** Unlimited Team and no spend limit: two facts, neither with a denominator, so neither draws. */
export const NoLimits: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      team: { held: true, licensedUsers: null, usersInUse: 240 },
      processor: { active: true },
      noCap: true,
      capUsd: null,
    },
    onAddCapacity: () => {},
    onEnterpriseQuote: () => {},
  },
};

export const Loading: Story = {
  args: { wallet: null, loading: true },
};
