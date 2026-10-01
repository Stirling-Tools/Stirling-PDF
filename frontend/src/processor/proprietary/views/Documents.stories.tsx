import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { Documents } from "@portal/views/Documents";

const meta: Meta<typeof Documents> = {
  title: "Portal/Views/Documents",
  component: Documents,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Documents>;

/** Seeded mock data: the filter pills + a populated review queue. */
export const Default: Story = {};

/**
 * A fresh workspace with nothing processed yet. The filter-pill toolbar + search
 * stay hidden; the empty state drives the user to create a pipeline (primary) or
 * connect a source (secondary) — the two things that feed the queue.
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/proprietary/ui-data/documents", () =>
          HttpResponse.json({
            summary: {
              totalInQueue: 0,
              processed: 0,
              errors: 0,
              processedToday: 0,
            },
            documents: [],
          }),
        ),
      ],
    },
  },
};
