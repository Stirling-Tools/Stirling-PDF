import type { Meta, StoryObj } from "@storybook/react-vite";
// Import the core stub directly via @core: the @app alias would resolve to the
// proprietary ChatPanel, which requires a live ChatProvider + file context.
import { ChatPanel } from "@core/components/chat/ChatPanel";

const meta = {
  title: "Chat/ChatPanel",
  component: ChatPanel,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ChatPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The core stub renders nothing; the proprietary build shadows it via @app/*. */
export const Default: Story = {
  args: {
    backLabel: "Back",
    onBack: () => {},
  },
};
