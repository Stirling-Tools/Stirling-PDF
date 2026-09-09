import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { DeploymentsTab } from "@portal/components/infrastructure/DeploymentsTab";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof DeploymentsTab> = {
  title: "Portal/Infrastructure/DeploymentsTab",
  component: DeploymentsTab,
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
type Story = StoryObj<typeof DeploymentsTab>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/deployments", async () => {
          await delay("infinite");
          return HttpResponse.json({ regions: [], recent: [] });
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/deployments", () =>
          HttpResponse.json({ regions: [], recent: [] }),
        ),
      ],
    },
  },
};
