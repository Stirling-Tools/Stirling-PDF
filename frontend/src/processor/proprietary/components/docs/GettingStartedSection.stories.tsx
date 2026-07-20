import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@processor/mocks/docs";
import { GettingStartedSection } from "@processor/components/docs/GettingStartedSection";
import "@processor/views/DeveloperDocs.css";

const { quickstartSamples, quickstartResponse } = docsContentFor("pro");

const meta: Meta<typeof GettingStartedSection> = {
  title: "Portal/DeveloperDocs/GettingStartedSection",
  component: GettingStartedSection,
  parameters: { layout: "padded" },
  args: { samples: quickstartSamples, response: quickstartResponse },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof GettingStartedSection>;

export const Default: Story = {};
