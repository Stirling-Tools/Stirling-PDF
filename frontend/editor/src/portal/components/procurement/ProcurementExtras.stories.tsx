import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ProcurementSnapshot } from "@portal/api/procurement";
import {
  LicenseModal,
  ScheduleCallModal,
  TrialSetupModal,
  TrialManageModal,
} from "@portal/components/procurement/ProcurementExtras";
import "@portal/views/Procurement.css";

/**
 * The small centred dialogs that hang off the deal-status hero's quick actions: the licence key,
 * schedule-a-call, trial setup, and trial management. Grouped in one story file since none is
 * substantial enough to warrant its own.
 */
const meta: Meta = {
  title: "Portal/Procurement/ProcurementExtras",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

const SNAPSHOT: ProcurementSnapshot = {
  dealId: 42,
  stage: "trial",
  deployment: "cloud",
  seats: 12,
  trialStartedAt: "2026-06-15T00:00:00Z",
  trialEndsAt: "2026-07-29T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  latestQuote: null,
};

// Licence key with the offline add-on available.
export const License: Story = {
  render: () => (
    <LicenseModal
      open
      onClose={() => {}}
      licenseKey="MOCK-ENTERPRISE-KEY-0001"
      offlineAvailable
      downloadingLicense={false}
      onDownloadOffline={() => {}}
    />
  ),
};

// Still on the trial licence: warns that the offline file must be re-downloaded once the
// agreement is in place.
export const LicenseTrial: Story = {
  render: () => (
    <LicenseModal
      open
      onClose={() => {}}
      licenseKey="MOCK-TRIAL-KEY-0001"
      offlineAvailable
      downloadingLicense={false}
      onDownloadOffline={() => {}}
      trial
    />
  ),
};

// Calendly's widget.js can't reach the network in Storybook, so this renders the
// "unable to load" fallback link rather than the live embed.
export const ScheduleCall: Story = {
  render: () => (
    <ScheduleCallModal open onClose={() => {}} email="buyer@example.com" />
  ),
};

// Deployment + seat count captured before the trial starts.
export const TrialSetup: Story = {
  render: () => (
    <TrialSetupModal
      open
      onClose={() => {}}
      busy={false}
      onConfirm={() => {}}
    />
  ),
};

// Trial in progress with extensions still available.
export const TrialManage: Story = {
  render: () => (
    <TrialManageModal
      open
      onClose={() => {}}
      snapshot={SNAPSHOT}
      busy={false}
      onExtend={() => {}}
      onCancel={() => {}}
    />
  ),
};

// Both extensions used: the extend action is disabled in favour of a "contact us" message.
export const TrialManageMaxed: Story = {
  render: () => (
    <TrialManageModal
      open
      onClose={() => {}}
      snapshot={{ ...SNAPSHOT, trialExtensionsUsed: 2 }}
      busy={false}
      onExtend={() => {}}
      onCancel={() => {}}
    />
  ),
};
