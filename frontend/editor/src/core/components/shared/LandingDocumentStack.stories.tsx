import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingDocumentStack } from "@app/components/shared/LandingDocumentStack";

/** Decorative stack only: window dots + grey bars — no props, no i18n. */
const meta: Meta<typeof LandingDocumentStack> = {
  title: "Shared/LandingDocumentStack",
  component: LandingDocumentStack,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
