import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkAccountFooterItem } from "@portal/components/LinkAccountFooterItem";

const meta: Meta<typeof LinkAccountFooterItem> = {
  title: "Portal/LinkAccountFooterItem",
  component: LinkAccountFooterItem,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Unlinked org — the "Link Stirling account" CTA appears in the sidebar footer. */
export const Unlinked: Story = {
  globals: { linkState: "unlinked" },
};

/** Linked org — the CTA hides itself (renders nothing), since the state is
 * already communicated elsewhere. */
export const Linked: Story = {
  globals: { linkState: "linked-subscribed" },
};
