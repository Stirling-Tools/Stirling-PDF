import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { DocumentTypeGrid } from "@portal/components/DocumentTypeGrid";

const meta: Meta<typeof DocumentTypeGrid> = {
  title: "Portal/Home/DocumentTypeGrid",
  component: DocumentTypeGrid,
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
type Story = StoryObj<typeof DocumentTypeGrid>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/endpoints", async () => {
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
      handlers: [http.get("/api/v1/endpoints", () => HttpResponse.json([]))],
    },
  },
};
