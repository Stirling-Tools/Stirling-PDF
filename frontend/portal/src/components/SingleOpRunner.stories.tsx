import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SingleOpRunner } from "@portal/components/SingleOpRunner";

const meta: Meta<typeof SingleOpRunner> = {
  title: "Portal/Home/SingleOpRunner",
  component: SingleOpRunner,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => console.log("close") },
  decorators: [
    (S) => (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SingleOpRunner>;

export const Idle: Story = {};

export const PreSelectedOp: Story = {
  args: { initialOpId: "redact" },
};

export const RunFailsWithUnknownOp: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/v1/ops/:opId/run", () =>
          HttpResponse.json({ error: "Unknown op" }, { status: 404 }),
        ),
      ],
    },
  },
};

export const SlowOp: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/v1/ops/:opId/run", async () => {
          await delay(4000);
          return HttpResponse.json({
            result: { schema: "demo", note: "took its time" },
            durationMs: 4000,
          });
        }),
      ],
    },
  },
};
