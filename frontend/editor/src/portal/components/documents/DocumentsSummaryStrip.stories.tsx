import type { Meta, StoryObj } from "@storybook/react-vite";
import { summaryFor } from "@portal/mocks/documents";
import { DocumentsSummaryStrip } from "@portal/components/documents/DocumentsSummaryStrip";
import "@portal/views/Documents.css";

const meta: Meta<typeof DocumentsSummaryStrip> = {
  title: "Portal/Documents/DocumentsSummaryStrip",
  component: DocumentsSummaryStrip,
  parameters: { layout: "padded" },
  args: { summary: summaryFor("enterprise"), loading: false },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "78rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DocumentsSummaryStrip>;

export const Default: Story = {};

export const Loading: Story = {
  args: { summary: null, loading: true },
};
