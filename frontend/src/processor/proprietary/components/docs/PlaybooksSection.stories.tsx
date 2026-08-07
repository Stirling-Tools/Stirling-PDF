import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@processor/mocks/docs";
import { PlaybooksSection } from "@processor/components/docs/PlaybooksSection";
import "@processor/views/DeveloperDocs.css";

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
