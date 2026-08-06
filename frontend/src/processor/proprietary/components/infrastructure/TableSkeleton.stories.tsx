import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@editor/ui";
import { TableSkeleton } from "@processor/components/infrastructure/TableSkeleton";
import "@processor/views/Infrastructure.css";

const meta: Meta<typeof TableSkeleton> = {
  title: "Portal/Infrastructure/TableSkeleton",
  component: TableSkeleton,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <Card padding="none" style={{ maxWidth: "60rem" }}>
        <S />
      </Card>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof TableSkeleton>;

export const Regions: Story = { args: { rows: 3, cols: 9 } };

export const AuditLog: Story = { args: { rows: 6, cols: 6 } };
