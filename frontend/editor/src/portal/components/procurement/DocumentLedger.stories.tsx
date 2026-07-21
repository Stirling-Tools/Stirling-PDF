import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentLedger } from "@portal/components/procurement/DocumentLedger";
import { buildProcurement } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const data = buildProcurement("enterprise");

const meta: Meta<typeof DocumentLedger> = {
  title: "Portal/Procurement/DocumentLedger",
  component: DocumentLedger,
  parameters: { layout: "padded" },
  args: {
    groups: data.ledger,
    supporting: data.supporting,
    journey: data.journey,
    currentStage: data.deal?.currentStage ?? "trial",
    onAction: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof DocumentLedger>;

// Mid-journey: the Agreement stage is open, earlier stages read as done, later
// stages are locked previews, and the supporting pool sits collapsed below.
export const Default: Story = {};

// Day one: only the Trial stage has been reached; everything ahead is locked.
export const AtTrial: Story = {
  args: { currentStage: "trial" },
};
