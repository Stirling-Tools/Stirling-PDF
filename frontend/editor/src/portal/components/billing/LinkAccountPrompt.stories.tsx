import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkAccountPrompt } from "@portal/components/billing/LinkAccountPrompt";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof LinkAccountPrompt> = {
  title: "Portal/Billing/LinkAccountPrompt",
  component: LinkAccountPrompt,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof LinkAccountPrompt>;

/** Unlinked billing page — CTA opens the login modal (UIProvider from the preview decorator). */
export const Default: Story = {};
