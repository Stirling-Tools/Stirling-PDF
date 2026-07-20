import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@processor/mocks/docs";
import { ErrorsSection } from "@processor/components/docs/ErrorsSection";
import "@processor/views/DeveloperDocs.css";

const meta: Meta<typeof ErrorsSection> = {
  title: "Portal/DeveloperDocs/ErrorsSection",
  component: ErrorsSection,
  parameters: { layout: "padded" },
  args: { errors: docsContentFor("pro").errors },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ErrorsSection>;

export const Default: Story = {};
