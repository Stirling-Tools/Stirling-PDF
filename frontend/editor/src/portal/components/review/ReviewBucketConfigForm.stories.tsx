import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewBucketConfigForm } from "@portal/components/review/ReviewBucketConfigForm";
import type { ReviewConfig } from "@portal/api/review";

const config = (overrides: Partial<ReviewConfig> = {}): ReviewConfig => ({
  enabled: true,
  watchedLabelIds: [],
  holdFailedRuns: true,
  holdUnlabeled: false,
  holdLowConfidence: true,
  confidenceThreshold: 0.8,
  ...overrides,
});

const withConfig = (value: ReviewConfig) => ({
  msw: {
    handlers: [
      http.get("*/api/v1/review/config", () => HttpResponse.json(value)),
      http.put("*/api/v1/review/config", async ({ request }) =>
        HttpResponse.json(await request.json()),
      ),
    ],
  },
});

const meta: Meta<typeof ReviewBucketConfigForm> = {
  title: "Portal/Review/ReviewBucketConfigForm",
  component: ReviewBucketConfigForm,
  parameters: { layout: "padded", ...withConfig(config()) },
  // The global preview decorators don't supply a QueryClient, and this form
  // fetches its config through react-query. A fresh client per story keeps the
  // stories from sharing cached config.
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <div style={{ maxWidth: "46rem" }}>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ReviewBucketConfigForm>;

/** Enabled with nothing watched — the state a team lands on after switching it on. */
export const Default: Story = {};

/** Off: everything below the master switch is dimmed and inert. */
export const Disabled: Story = {
  parameters: withConfig(config({ enabled: false })),
};

/** A whole category watched plus a partial one, showing both summary states. */
export const CategoriesWatched: Story = {
  parameters: withConfig(
    config({
      watchedLabelIds: [
        "medical-report",
        "lab-report",
        "radiology-report",
        "pathology-report",
        "prescription",
        "referral-letter",
        "discharge-summary",
        "immunization-record",
        "medical-invoice",
        "insurance-policy",
        "insurance-claim",
        "insurance-certificate",
        "explanation-of-benefits",
        "invoice",
        "receipt",
      ],
    }),
  ),
};

/** Non-default advanced rules force the Advanced block open on load. */
export const AdvancedDeviates: Story = {
  parameters: withConfig(
    config({
      holdFailedRuns: false,
      holdUnlabeled: true,
      holdLowConfidence: false,
    }),
  ),
};
