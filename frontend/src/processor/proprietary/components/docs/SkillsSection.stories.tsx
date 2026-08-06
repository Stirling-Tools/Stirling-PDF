import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@processor/mocks/docs";
import { SkillsSection } from "@processor/components/docs/SkillsSection";
import "@processor/views/DeveloperDocs.css";

const meta: Meta<typeof SkillsSection> = {
  title: "Portal/DeveloperDocs/SkillsSection",
  component: SkillsSection,
  parameters: { layout: "padded" },
  args: { skills: docsContentFor("pro").skills },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SkillsSection>;

export const Default: Story = {};
