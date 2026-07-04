import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { NotificationsDropdown } from "@portal/components/NotificationsDropdown";
import { NOTIFICATIONS } from "@portal/mocks/notifications";

const meta: Meta<typeof NotificationsDropdown> = {
  title: "Portal/Header/NotificationsDropdown",
  component: NotificationsDropdown,
  parameters: { layout: "centered" },
  decorators: [
    (S) => (
      <div
        style={{
          padding: "4rem 8rem",
          minHeight: "30rem",
          background: "var(--color-bg)",
        }}
      >
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof NotificationsDropdown>;

export const Default: Story = {};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [http.get("/v1/notifications", () => HttpResponse.json([]))],
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/notifications", async () => {
          await delay("infinite");
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

export const HighVolume: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/notifications", () => {
          const items = Array.from({ length: 24 }, (_, i) => ({
            ...NOTIFICATIONS[i % NOTIFICATIONS.length],
            id: `n${i + 1}`,
          }));
          return HttpResponse.json(items);
        }),
      ],
    },
  },
};

export const NetworkError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/notifications", () =>
          HttpResponse.json({ error: "Service unavailable" }, { status: 503 }),
        ),
      ],
    },
  },
};
