import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataRow } from "@shared/components/DataRow";
import { ChipFlow } from "@shared/components/ChipFlow";
import { Card } from "@shared/components/Card";

const meta: Meta<typeof DataRow> = {
  title: "Primitives/DataRow",
  component: DataRow,
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
type Story = StoryObj<typeof DataRow>;

export const Single: Story = {
  args: { label: "Reviewer", children: "matt@stirlingpdf.com" },
};

export const Summary: Story = {
  render: () => (
    <Card padding="default">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <DataRow label="Enforces" align="top">
          <ChipFlow items={["Classify", "Extract", "Name"]} />
        </DataRow>
        <DataRow label="Sources">3 selected</DataRow>
        <DataRow label="Reviewer">matt@stirlingpdf.com</DataRow>
      </div>
    </Card>
  ),
};
