import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthenticationSection } from "@processor/components/docs/AuthenticationSection";
import "@processor/views/DeveloperDocs.css";

const meta: Meta<typeof AuthenticationSection> = {
  title: "Portal/DeveloperDocs/AuthenticationSection",
  component: AuthenticationSection,
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
type Story = StoryObj<typeof AuthenticationSection>;

export const Default: Story = {};
