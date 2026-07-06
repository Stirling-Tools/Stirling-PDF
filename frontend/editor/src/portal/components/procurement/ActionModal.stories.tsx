import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActionModal } from "@portal/components/procurement/ActionModal";
import type { LedgerDoc } from "@portal/api/procurement";
import "@portal/views/Procurement.css";

const meta: Meta<typeof ActionModal> = {
  title: "Portal/Procurement/ActionModal",
  component: ActionModal,
  parameters: { layout: "fullscreen" },
  args: { onClose: () => {}, onDone: () => {} },
};
export default meta;
type Story = StoryObj<typeof ActionModal>;

const sign: LedgerDoc = {
  id: "d1",
  name: "Stirling Enterprise Agreement",
  sub: "One signature: MSA + order form + EULA + DPA.",
  status: "action",
  action: "sign",
};

const pay: LedgerDoc = {
  id: "d2",
  name: "Pay online",
  sub: "Card or bank transfer via Stripe.",
  status: "pending",
  action: "pay",
};

const upload: LedgerDoc = {
  id: "d3",
  name: "Purchase order",
  sub: "Upload it and we invoice against it.",
  status: "request",
  action: "upload",
};

const requestPaid: LedgerDoc = {
  id: "d4",
  name: "Custom security review",
  sub: "Dedicated session with our security team.",
  status: "request",
  action: "request",
  fee: 5_000,
};

export const Sign: Story = { args: { doc: sign } };
export const Pay: Story = { args: { doc: pay } };
export const UploadPO: Story = { args: { doc: upload } };
export const RequestPaid: Story = { args: { doc: requestPaid } };
