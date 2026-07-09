import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { Sources } from "@portal/views/Sources";

const meta: Meta<typeof Sources> = {
  title: "Portal/Views/Sources",
  component: Sources,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Sources>;

/** Seeded mock data: the KPI strip plus a populated sources table. */
export const Default: Story = {};

/**
 * A fresh workspace with no sources connected. The stat boxes stay hidden and
 * the empty-state panel drives the user to connect a source (primary) or read
 * the docs (secondary).
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/sources", () =>
          HttpResponse.json({
            kpis: [
              { value: 0, description: "" },
              { value: 0, description: "" },
              { value: 0, description: "" },
            ],
            sources: [],
          }),
        ),
      ],
    },
  },
};
