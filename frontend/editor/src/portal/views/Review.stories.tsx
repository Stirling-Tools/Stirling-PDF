import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { Review } from "@portal/views/Review";

const meta: Meta<typeof Review> = {
  title: "Portal/Views/Review",
  component: Review,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Review>;

/** Seeded mock data: a classified failure, an unclassified one, a repeat, and a closed row. */
export const Default: Story = {};

/** A workspace whose policy runs have all succeeded. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/file-run-events", () =>
          HttpResponse.json({ events: [] }),
        ),
      ],
    },
  },
};

/** Reviewing is leader-only, so a member's read is refused and the screen says so. */
export const Refused: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/file-run-events", () =>
          HttpResponse.json({ detail: "Forbidden" }, { status: 403 }),
        ),
      ],
    },
  },
};
