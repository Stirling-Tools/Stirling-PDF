import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectDoneSlide } from "@portal/components/account-link/connect/ConnectDoneSlide";

const meta: Meta<typeof ConnectDoneSlide> = {
  title: "Portal/AccountLink/Connect/DoneSlide",
  component: ConnectDoneSlide,
  args: { onNavigate: () => {} },
};
export default meta;
type Story = StoryObj<typeof ConnectDoneSlide>;

/**
 * Step 3, without a readable wallet. There are no billing MSW handlers, so the balance request
 * fails here and the figure is omitted — which is the real behaviour whenever the wallet cannot be
 * read, and the state worth eyeballing since it must not leave a gap or a placeholder number.
 */
export const Default: Story = {};
