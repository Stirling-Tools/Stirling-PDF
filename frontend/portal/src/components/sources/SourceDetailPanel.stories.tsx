import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Source } from "@portal/api/sources";
import { sourcesFor } from "@portal/mocks/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";

const ENTERPRISE = sourcesFor("enterprise");
const byType = (type: Source["type"]) =>
  ENTERPRISE.find((s) => s.type === type)!;

const meta: Meta<typeof SourceDetailPanel> = {
  title: "Portal/Sources/SourceDetailPanel",
  component: SourceDetailPanel,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "48rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SourceDetailPanel>;

export const Agent: Story = { args: { source: byType("agent") } };
export const ApiClient: Story = { args: { source: byType("apiclient") } };
export const Webhook: Story = { args: { source: byType("webhook") } };
/** "basic" covers editor, connector, email, desktop and batch sources. */
export const Basic: Story = { args: { source: byType("connector") } };
