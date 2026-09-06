import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sidebar } from "@portal/components/Sidebar";
import { ProcessorChatProvider } from "@app/components/chat/ChatContext";

const meta: Meta<typeof Sidebar> = {
  title: "Portal/Shell/Sidebar",
  component: Sidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    // The rail carries the assistant trigger, which reads the chat context.
    (S) => (
      <ProcessorChatProvider>
        <div
          style={{
            display: "flex",
            height: "100vh",
            background: "var(--c-bg)",
          }}
        >
          <S />
        </div>
      </ProcessorChatProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};

export const FreeTier: Story = { globals: { tier: "free" } };

export const EnterpriseTier: Story = { globals: { tier: "enterprise" } };
