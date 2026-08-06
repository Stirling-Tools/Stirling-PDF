import type { Meta, StoryObj } from "@storybook/react-vite";
import { WebhooksSection } from "@processor/components/docs/WebhooksSection";
import "@processor/views/DeveloperDocs.css";

const meta: Meta<typeof WebhooksSection> = {
  title: "Portal/DeveloperDocs/WebhooksSection",
  component: WebhooksSection,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof WebhooksSection>;

export const Default: Story = {};
