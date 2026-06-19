import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { ReviewQueue } from "@portal/components/documents/ReviewQueue";
import "@portal/views/Documents.css";

const meta: Meta<typeof ReviewQueue> = {
  title: "Portal/Documents/ReviewQueue",
  component: ReviewQueue,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "78rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ReviewQueue>;

/** Live queue served by the default MSW handler (drives off the toolbar tier). */
export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/documents", async () => {
          await delay("infinite");
          return HttpResponse.json({ summary: {}, documents: [] });
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/documents", () =>
          HttpResponse.json({
            summary: {
              totalInQueue: 0,
              needsReview: 0,
              avgConfidence: 0,
              processedToday: 0,
            },
            documents: [],
          }),
        ),
      ],
    },
  },
};
