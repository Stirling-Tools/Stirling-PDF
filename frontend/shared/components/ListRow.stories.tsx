import type { Meta, StoryObj } from "@storybook/react-vite";
import { ListRow } from "@shared/components/ListRow";
import { Card } from "@shared/components/Card";
import { StatusBadge } from "@shared/components/StatusBadge";

const meta: Meta<typeof ListRow> = {
  title: "Primitives/ListRow",
  component: ListRow,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "24rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ListRow>;

function Dot({ ch }: { ch: string }) {
  return <span style={{ fontSize: 12, fontWeight: 700 }}>{ch}</span>;
}

export const Default: Story = {
  args: {
    leading: <Dot ch="✓" />,
    leadingTone: "success",
    title: "MSA_Acme_2026.pdf",
    description: "Classified as Contract • 3 tables extracted",
    meta: "2h ago",
  },
};

/** A divided list inside a padding-none Card — the canonical usage. */
export const InCard: Story = {
  render: () => (
    <Card padding="none">
      <ListRow
        leading={<Dot ch="✓" />}
        leadingTone="success"
        title="MSA_Acme_2026.pdf"
        description="Classified as Contract • 3 tables extracted"
        meta="2h ago"
      />
      <ListRow
        divider
        leading={<Dot ch="!" />}
        leadingTone="warning"
        title="scan_002.pdf"
        description="Low confidence (62%) • flagged for review"
        meta="Yesterday"
        trailing={
          <StatusBadge tone="warning" size="sm">
            Flagged
          </StatusBadge>
        }
      />
      <ListRow
        divider
        leading={<Dot ch="✓" />}
        leadingTone="success"
        title="Invoice_4471.pdf"
        description="Classified as Invoice • renamed to standard"
        meta="5h ago"
      />
    </Card>
  ),
};

export const Interactive: Story = {
  args: {
    leading: <Dot ch="→" />,
    leadingTone: "info",
    title: "Clickable row",
    description: "The whole row is a button",
    onClick: () => {},
  },
};
