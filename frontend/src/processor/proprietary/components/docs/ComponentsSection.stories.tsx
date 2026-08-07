import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@processor/mocks/docs";
import { ComponentsSection } from "@processor/components/docs/ComponentsSection";
import "@processor/views/DeveloperDocs.css";

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
