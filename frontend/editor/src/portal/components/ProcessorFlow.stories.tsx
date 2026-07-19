import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { ProcessorFlow } from "@portal/components/ProcessorFlow";

/**
 * The home processor visualiser. Data is served by the global portal MSW
 * handlers (seeded sources + one active Security policy + its runs), so the
 * middle column shows Security "active" and Classification with a "Set up" CTA,
 * and the outcomes reflect the seeded 24h success/failure split.
 *
 * NB: the flow particles animate via requestAnimationFrame, which browsers
 * pause while the tab/preview is hidden — open the story in a focused tab to
 * see the dots move.
 */
const meta: Meta<typeof ProcessorFlow> = {
  title: "Portal/Components/ProcessorFlow",
  component: ProcessorFlow,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof ProcessorFlow>;

/** Live machine: Security configured + real throughput → the flow runs. */
export const Default: Story = {};

/**
 * Nothing set up and no activity — the empty state from the design. In
 * production the flow stays still here; the DEV_KEEP_FLOWING dev flag forces it
 * on with synthetic rates so the animation is visible while iterating.
 */
export const IdleEmpty: Story = {
  parameters: {
    msw: {
      handlers: [
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
        http.get("/api/v1/policies", () => HttpResponse.json([])),
        http.get("/api/v1/policies/runs", () => HttpResponse.json([])),
      ],
    },
  },
};
