import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SecurityTab } from "@portal/components/infrastructure/SecurityTab";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof SecurityTab> = {
  title: "Portal/Infrastructure/SecurityTab",
  component: SecurityTab,
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
type Story = StoryObj<typeof SecurityTab>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/infrastructure/security", async () => {
          await delay("infinite");
          return HttpResponse.json(null);
        }),
      ],
    },
  },
};

export const Unavailable: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/infrastructure/security", () =>
          HttpResponse.json(null, { status: 503 }),
        ),
      ],
    },
  },
};
