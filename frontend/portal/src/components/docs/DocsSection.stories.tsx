import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@shared/components";
import { DocsSection } from "@portal/components/docs/DocsSection";
import "@portal/views/DeveloperDocs.css";

const meta: Meta<typeof DocsSection> = {
  title: "Portal/DeveloperDocs/DocsSection",
  component: DocsSection,
  parameters: { layout: "padded" },
  args: {
    id: "example",
    eyebrow: "API REFERENCE",
    title: "Section heading",
    lead: "A short lead paragraph introducing the section's content.",
    children: <Card padding="default">Section body</Card>,
  },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DocsSection>;

export const Default: Story = {};

export const WithoutLead: Story = {
  args: { lead: undefined },
};
