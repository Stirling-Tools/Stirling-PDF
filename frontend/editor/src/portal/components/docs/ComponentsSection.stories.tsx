import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@portal/mocks/docs";
import { ComponentsSection } from "@portal/components/docs/ComponentsSection";
import "@portal/views/DeveloperDocs.css";

const meta: Meta<typeof ComponentsSection> = {
  title: "Portal/DeveloperDocs/ComponentsSection",
  component: ComponentsSection,
  parameters: { layout: "padded" },
  args: { components: docsContentFor("pro").components },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ComponentsSection>;

export const Default: Story = {};
