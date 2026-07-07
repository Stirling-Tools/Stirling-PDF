import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelChip } from "@app/ui/LabelChip";

const meta: Meta<typeof LabelChip> = {
  title: "Primitives/LabelChip",
  component: LabelChip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { label: "Invoice", icon: "receipt-long" },
  argTypes: {
    label: { control: "text" },
    icon: { control: "text" },
    count: { control: "number" },
    onRemove: { action: "removed" },
  },
};
export default meta;
type Story = StoryObj<typeof LabelChip>;

/** The classification-label pill shared by the labels editor and the sidebar category manager. */
export const Playground: Story = {};

/** With a file count, as shown in the sidebar category manager. */
export const WithCount: Story = {
  args: { label: "Contract", icon: "handshake", count: 12 },
};

/** Removable — the trailing × appears when `onRemove` is set. */
export const Removable: Story = {
  args: { label: "NDA", icon: "lock", onRemove: () => {} },
};

/** Falls back to the default "sell" icon when none is given. */
export const DefaultIcon: Story = {
  args: { label: "Uncategorised label", icon: undefined },
};

/** Long names truncate rather than overflow the pill. */
export const LongName: Story = {
  args: { label: "Memorandum of understanding and mutual agreement", count: 3 },
};

export const Row: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 420 }}>
      <LabelChip label="Invoice" icon="receipt-long" count={12} />
      <LabelChip label="Contract" icon="handshake" onRemove={() => {}} />
      <LabelChip label="Lab report" icon="science" count={2} />
      <LabelChip label="Payslip" icon="payments" />
    </div>
  ),
};
