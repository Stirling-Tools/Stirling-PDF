import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Source } from "@portal/api/sources";
import { sourcesFor } from "@portal/mocks/sources";
import { SourceDetailCard } from "@portal/components/sources/SourceDetailCard";

const ENTERPRISE = sourcesFor("enterprise");
const byType = (type: Source["type"]) =>
  ENTERPRISE.find((s) => s.type === type)!;

const meta: Meta<typeof SourceDetailCard> = {
  title: "Portal/Sources/SourceDetailCard",
  component: SourceDetailCard,
  parameters: { layout: "padded" },
  args: { onClose: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "56rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SourceDetailCard>;

export const Agent: Story = { args: { source: byType("agent") } };
export const Webhook: Story = { args: { source: byType("webhook") } };
export const Connector: Story = { args: { source: byType("connector") } };
