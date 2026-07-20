import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@processor/mocks/docs";
import { LangSnippet } from "@processor/components/docs/LangSnippet";
import "@processor/views/DeveloperDocs.css";

const { quickstartSamples } = docsContentFor("pro");

const meta: Meta<typeof LangSnippet> = {
  title: "Portal/DeveloperDocs/LangSnippet",
  component: LangSnippet,
  parameters: { layout: "padded" },
  args: { samples: quickstartSamples, caption: "extract an invoice" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "44rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LangSnippet>;

export const Default: Story = {};

export const SingleLanguage: Story = {
  args: { samples: quickstartSamples.slice(0, 1), caption: undefined },
};
