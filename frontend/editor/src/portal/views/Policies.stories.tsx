import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { Policies } from "@portal/views/Policies";

const meta: Meta<typeof Policies> = {
  title: "Portal/Views/Policies",
  component: Policies,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Policies>;

/** Seeded mock data: the summary strip plus the configured catalogue. */
export const Default: Story = {};

/**
 * A fresh workspace with no policies configured. The summary stat boxes stay
 * hidden; the catalogue cards remain, since each one is the CTA to configure
 * that policy category.
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/policies", () => HttpResponse.json([])),
        http.get("/api/v1/policies/runs", () => HttpResponse.json([])),
      ],
    },
  },
};
