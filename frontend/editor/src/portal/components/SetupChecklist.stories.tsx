import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SetupChecklist } from "@portal/components/SetupChecklist";

const meta: Meta<typeof SetupChecklist> = {
  title: "Portal/Home/SetupChecklist",
  component: SetupChecklist,
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

/** Completion + counts derived from the live policies / sources MSW fixtures. */
export const Default: Story = {};

/** Slow policy/source fetch: shows the loading skeleton rows. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/policies", async () => {
          await delay(100000);
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

/** A fresh workspace — no active policies or connected sources: every step reads "Not started". */
export const NotStarted: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/policies", () => HttpResponse.json([])),
        http.get("/api/v1/policies/runs", () => HttpResponse.json([])),
        http.get("/api/v1/sources", () =>
          HttpResponse.json({ kpis: [], sources: [] }),
        ),
      ],
    },
  },
};
