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
        http.get(
          "*/api/v1/proprietary/ui-data/infrastructure/audit-log",
          async () => {
            await delay("infinite");
            return HttpResponse.json({ summary: {}, events: [] });
          },
        ),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/proprietary/ui-data/infrastructure/audit-log", () =>
          HttpResponse.json({
            summary: { totalEvents: 0, processing: 0, elevation: 0, config: 0 },
            events: [],
            fullServer: true,
          }),
        ),
      ],
    },
  },
};

// A team member who isn't a lead (or any caller the backend scopes out) gets a
// 403 - the tab shows the access message, not the "no events" empty state.
export const NonLeadForbidden: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/proprietary/ui-data/infrastructure/audit-log", () =>
          HttpResponse.json({ detail: "Not permitted" }, { status: 403 }),
        ),
      ],
    },
  },
};

// A team leader sees only their own team's events - a narrower slice than the
// admin whole-server view (the Default story). fullServer:false, so no Export.
export const TeamLeadScoped: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/proprietary/ui-data/infrastructure/audit-log", () =>
          HttpResponse.json({
            summary: { totalEvents: 4, processing: 2, elevation: 0, config: 1 },
            events: [
              {
                id: "9102",
                timestamp: "2026-07-07 18:12:03",
                category: "processing",
                action: "Compress PDF",
                actor: "alice.chen@acme.com",
                target: "acme-invoice-8841.pdf",
                status: "success",
                latencyMs: 842,
              },
              {
                id: "9101",
                timestamp: "2026-07-07 17:44:20",
                category: "auth",
                action: "User signed in",
                actor: "bob.martin@acme.com",
                target: "Web session",
                status: "success",
                latencyMs: 128,
              },
              {
                id: "9100",
                timestamp: "2026-07-07 17:05:58",
                category: "config",
                action: "Profile settings updated",
                actor: "alice.chen@acme.com",
                target: "/api/v1/user/change-settings",
                status: "info",
                latencyMs: 175,
              },
              {
                id: "9099",
                timestamp: "2026-07-07 16:31:11",
                category: "processing",
                action: "Merge PDFs",
                actor: "bob.martin@acme.com",
                target: "onboarding-packet.pdf",
                status: "success",
                latencyMs: 2199,
              },
            ],
            fullServer: false,
          }),
        ),
      ],
    },
  },
};
