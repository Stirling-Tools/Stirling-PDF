import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SetupChecklist } from "@portal/components/SetupChecklist";

const meta: Meta<typeof SetupChecklist> = {
  title: "Portal/Home/SetupChecklist",
  component: SetupChecklist,
  args: { onTryOp: () => console.log("try op") },
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div
        style={{
          maxWidth: "60rem",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          background: "var(--color-surface)",
        }}
      >
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SetupChecklist>;

/** Default free-tier checklist (2 of 3 done), served by the global MSW handlers. */
export const Default: Story = {};

/** Slow fetch: shows the loading skeleton rows. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/onboarding", async () => {
          await delay(100000);
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

/** No steps returned — the checklist collapses to just the Enterprise rung. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/onboarding", async () => {
          await delay(120);
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};
