import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { AuditTab } from "@portal/components/infrastructure/AuditTab";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof AuditTab> = {
  title: "Portal/Infrastructure/AuditTab",
  component: AuditTab,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AuditTab>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/audit-log", async () => {
          await delay("infinite");
          return HttpResponse.json({ summary: {}, events: [] });
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/audit-log", () =>
          HttpResponse.json({
            summary: { totalEvents: 0, processing: 0, elevation: 0, config: 0 },
            events: [],
          }),
        ),
      ],
    },
  },
};
