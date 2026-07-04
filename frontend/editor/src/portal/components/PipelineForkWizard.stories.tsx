import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineForkWizard } from "@portal/components/PipelineForkWizard";

const meta: Meta<typeof PipelineForkWizard> = {
  title: "Portal/Home/PipelineForkWizard",
  component: PipelineForkWizard,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "44rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineForkWizard>;

/** Pick a template to watch the deterministic four-stage build animation. */
export const Default: Story = {};
