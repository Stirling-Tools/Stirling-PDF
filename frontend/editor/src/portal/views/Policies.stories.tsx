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

/** No connected sources (only the editor): the wizard shows its connect prompts. */
export const NoSources: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/policies", () => HttpResponse.json([])),
        http.get("/api/v1/policies/runs", () => HttpResponse.json([])),
        http.get("/api/v1/sources", () =>
          HttpResponse.json({
            kpis: [],
            sources: [
              {
                id: "editor",
                name: "Editor",
                type: "editor",
                status: "active",
                referenceCount: 0,
                referencingPolicies: [],
                config: [],
                docsTotal: 0,
                docs24h: 0,
                docs30d: 0,
              },
            ],
          }),
        ),
      ],
    },
  },
};
