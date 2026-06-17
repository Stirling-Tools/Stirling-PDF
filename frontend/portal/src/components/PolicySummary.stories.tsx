import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { PolicySummary } from "@portal/components/PolicySummary";

const meta: Meta<typeof PolicySummary> = {
  title: "Portal/Home/PolicySummary",
  component: PolicySummary,
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
type Story = StoryObj<typeof PolicySummary>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/policies", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/policies", () =>
          HttpResponse.json({
            summary: { active: 0, paused: 0, categories: 0, docsEnforced: 0 },
            catalogue: [],
          }),
        ),
      ],
    },
  },
};
