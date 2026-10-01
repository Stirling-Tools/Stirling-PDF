import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { Integrations } from "@portal/views/Integrations";

const meta: Meta<typeof Integrations> = {
  title: "Portal/Views/Integrations",
  component: Integrations,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Integrations>;

/** Seeded mock data: connected vendors (expandable groups) plus the available catalogue. */
export const Default: Story = {};

/**
 * No stored connections yet. Only the "Available" catalogue and coming-soon
 * source connectors are left to show.
 */
export const NoConnections: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/integrations", () => HttpResponse.json([])),
      ],
    },
  },
};
