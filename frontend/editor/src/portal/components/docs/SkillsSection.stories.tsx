import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@portal/mocks/docs";
import { SkillsSection } from "@portal/components/docs/SkillsSection";
import "@portal/views/DeveloperDocs.css";

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
