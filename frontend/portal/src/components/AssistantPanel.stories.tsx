import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { http, HttpResponse, delay } from "msw";
import { AssistantPanel } from "@portal/components/AssistantPanel";
import { useUI } from "@portal/contexts/UIContext";

function ForceOpen() {
  const { openAssistant } = useUI();
  useEffect(() => {
    openAssistant();
  }, [openAssistant]);
  return null;
}

const meta: Meta<typeof AssistantPanel> = {
  title: "Portal/Assistant/AssistantPanel",
  component: AssistantPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (S) => (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <ForceOpen />
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AssistantPanel>;

export const SuggestionsOnly: Story = {};

export const SlowReply: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/v1/assistant/messages", async () => {
          await delay(3000);
          return HttpResponse.json({
            reply:
              "After a long pause: here's a deliberately slow reply to demo the typing indicator under real network latency.",
          });
        }),
      ],
    },
  },
};

export const ReplyFails: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/v1/assistant/messages", () =>
          HttpResponse.json({ error: "rate limit exceeded" }, { status: 429 }),
        ),
      ],
    },
  },
};
