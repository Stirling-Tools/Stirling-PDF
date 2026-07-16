import type { Meta, StoryObj } from "@storybook/react-vite";
import LegalSection from "@app/components/shared/config/configSections/LegalSection";

const meta = {
  title: "Shared/Config/LegalSection",
  component: LegalSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LegalSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
