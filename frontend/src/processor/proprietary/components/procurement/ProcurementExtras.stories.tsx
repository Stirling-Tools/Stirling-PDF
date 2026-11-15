import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DocumentsList,
  ScheduleCallModal,
  TrialSetupForm,
} from "@processor/components/procurement/ProcurementExtras";
import "@processor/views/Procurement.css";

/**
 * The Enterprise page's pieces outside the journey's stages: the trial setup form, the documents
 * list and booking a call. One file, since none is big enough for its own.
 */
const meta: Meta = {
  title: "Portal/Procurement/ProcurementExtras",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj;

// Calendly's widget.js can't reach the network in Storybook, so this renders the
// "unable to load" fallback link rather than the live embed.
export const ScheduleCall: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <ScheduleCallModal open onClose={() => {}} email="buyer@example.com" />
  ),
};

// Two steps before the trial starts: how they'll run it, then who is buying.
export const TrialSetup: Story = {
  render: () => (
    <TrialSetupForm
      busy={false}
      email="buyer@example.com"
      onScheduleCall={() => {}}
      onConfirm={() => {}}
    />
  ),
};

// Before a quote is issued: only the reference documents are available.
export const Documents: Story = {
  render: () => (
    <DocumentsList
      onDownloadAgreement={() => {}}
      quoteAvailable={false}
      onDownloadQuote={() => {}}
    />
  ),
};
