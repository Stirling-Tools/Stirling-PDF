import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildGettingStartedResponse } from "@portal/mocks/gettingStarted";
import { DocumentAnalyzer } from "@portal/components/getting-started/DocumentAnalyzer";
import "@portal/views/GettingStarted.css";

const { stages } = buildGettingStartedResponse("pro");

const meta: Meta<typeof DocumentAnalyzer> = {
  title: "Portal/GettingStarted/DocumentAnalyzer",
  component: DocumentAnalyzer,
  parameters: { layout: "padded" },
  args: { stages, onComplete: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "40rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DocumentAnalyzer>;

/** Idle until a file is dropped or the sample is analyzed; then the checklist animates. */
export const Default: Story = {};
