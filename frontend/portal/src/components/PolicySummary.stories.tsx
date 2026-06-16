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

/** Use the Tier toolbar to see free vs pro vs enterprise locking. */
export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/policies", async () => {
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
        http.get("/v1/policies", () =>
          HttpResponse.json({
            summary: {
              activePolicies: 0,
              totalCategories: 5,
              docTypesCovered: 0,
              lastChange: "never",
              lastChangeBy: "—",
            },
            categories: [],
          }),
        ),
      ],
    },
  },
};
