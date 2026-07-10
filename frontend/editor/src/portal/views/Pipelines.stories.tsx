import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { Pipelines } from "@portal/views/Pipelines";

const meta: Meta<typeof Pipelines> = {
  title: "Portal/Views/Pipelines",
  component: Pipelines,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Pipelines>;

/** Seeded mock data: the KPI strip plus a populated pipelines table. */
export const Default: Story = {};

/**
 * A fresh workspace with no pipelines. The stat boxes stay hidden and the
 * empty-state panel drives the user to create a pipeline (primary) or connect a
 * source (secondary).
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/policies/overview", () =>
          HttpResponse.json({
            kpis: [
              { value: 0, description: "" },
              { value: 0, description: "" },
              { value: 0, description: "" },
            ],
            pipelines: [],
          }),
        ),
      ],
    },
  },
};
