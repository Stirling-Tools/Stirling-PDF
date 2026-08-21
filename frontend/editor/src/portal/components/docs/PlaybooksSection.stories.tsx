import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@portal/mocks/docs";
import { PlaybooksSection } from "@portal/components/docs/PlaybooksSection";
import "@portal/views/DeveloperDocs.css";

const meta: Meta<typeof PlaybooksSection> = {
  title: "Portal/DeveloperDocs/PlaybooksSection",
  component: PlaybooksSection,
  parameters: { layout: "padded" },
  args: { playbooks: docsContentFor("pro").playbooks },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PlaybooksSection>;

export const Default: Story = {};
