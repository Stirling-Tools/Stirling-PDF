import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { ApiKeysTab } from "@portal/components/infrastructure/ApiKeysTab";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof ApiKeysTab> = {
  title: "Portal/Infrastructure/ApiKeysTab",
  component: ApiKeysTab,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "60rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ApiKeysTab>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/api-keys", async () => {
          await delay("infinite");
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/api-keys", () => HttpResponse.json([])),
      ],
    },
  },
};
