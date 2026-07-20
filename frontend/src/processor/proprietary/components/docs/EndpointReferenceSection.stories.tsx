import type { Meta, StoryObj } from "@storybook/react-vite";
import { EndpointReferenceSection } from "@processor/components/docs/EndpointReferenceSection";
import "@processor/views/DeveloperDocs.css";

const meta: Meta<typeof EndpointReferenceSection> = {
  title: "Portal/DeveloperDocs/EndpointReferenceSection",
  component: EndpointReferenceSection,
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
type Story = StoryObj<typeof EndpointReferenceSection>;

export const Default: Story = {};
