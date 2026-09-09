import type { Meta, StoryObj } from "@storybook/react-vite";
import { docsContentFor } from "@portal/mocks/docs";
import { SdksSection } from "@portal/components/docs/SdksSection";
import "@portal/views/DeveloperDocs.css";

const { sdks } = docsContentFor("pro");

const meta: Meta<typeof SdksSection> = {
  title: "Portal/DeveloperDocs/SdksSection",
  component: SdksSection,
  parameters: { layout: "padded" },
  args: { sdks },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "46rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SdksSection>;

/** Full matrix — GA clients carry no badge; Beta and Deprecated are flagged. */
export const Default: Story = {};

export const GaOnly: Story = {
  args: { sdks: sdks.filter((s) => s.status === "ga") },
};
