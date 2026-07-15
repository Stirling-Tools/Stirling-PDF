import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { AccountLinkPanel } from "@portal/components/account-link/AccountLinkPanel";
import "@portal/views/AccountLink.css";

// AccountLinkPanel reads the shared account-link instance from context (the
// preview only supplies LinkProvider), so wrap it in AccountLinkProvider here.
const meta: Meta<typeof AccountLinkPanel> = {
  title: "Portal/AccountLink/AccountLinkPanel",
  component: AccountLinkPanel,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <AccountLinkProvider>
        <Story />
      </AccountLinkProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AccountLinkPanel>;

/**
 * The Settings account-link surface: the status badge (driven by the Link
 * toolbar global), the LinkAccountCard for this instance, and — once linked —
 * the team-wide linked-instances table.
 */
export const Default: Story = {};
