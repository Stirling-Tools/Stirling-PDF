import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Review } from "@portal/views/Review";
import type { ReviewItem } from "@portal/api/review";
import { buildReviewPdfBytes } from "@portal/mocks/review";

const HOUR = 60 * 60 * 1000;
const BASE = Date.UTC(2026, 6, 28, 12, 0, 0);

const item = (over: Partial<ReviewItem> & { id: string }): ReviewItem => ({
  runId: `run-${over.id}`,
  policyId: "p1",
  policyName: "Webhook -> S3 test",
  status: "PENDING",
  createdAt: BASE,
  resolvedAt: null,
  resolvedBy: null,
  files: [{ fileId: `f-${over.id}`, fileName: `${over.id}.pdf` }],
  reasons: [],
  labels: [],
  filesAreInputs: false,
  destinations: ["Amazon S3 · processed/"],
  ...over,
});

/** A queue with every reason kind, two policies and a spread of dates, so the
 *  filters and the date sort have something to bite on. */
const ITEMS: ReviewItem[] = [
  item({
    id: "invoice-acme",
    createdAt: BASE,
    reasons: [
      {
        kind: "WATCHED_LABEL",
        labelId: "invoice",
        confidence: 0.97,
        detail: null,
      },
    ],
    labels: [{ labelId: "invoice", confidence: 0.97 }],
  }),
  item({
    id: "lab-results",
    createdAt: BASE - HOUR,
    policyName: "Medical intake",
    reasons: [
      {
        kind: "LOW_CONFIDENCE",
        labelId: "lab-report",
        confidence: 0.41,
        detail: null,
      },
    ],
    labels: [{ labelId: "lab-report", confidence: 0.41 }],
  }),
  item({
    id: "scan-unknown",
    createdAt: BASE - 2 * HOUR,
    reasons: [
      { kind: "NO_LABEL", labelId: null, confidence: null, detail: null },
    ],
  }),
  item({
    id: "patient-form",
    createdAt: BASE - 3 * HOUR,
    policyName: "Medical intake",
    reasons: [
      {
        kind: "SKIPPED_LABEL",
        labelId: "medical-report",
        confidence: 0.33,
        detail: "mentions a patient name",
      },
    ],
    labels: [{ labelId: "intake-form", confidence: 0.88 }],
  }),
  item({
    id: "faint-scan",
    createdAt: BASE - 4 * HOUR,
    policyName: "Scan intake",
    // A policy that fans out: approving releases to both destinations.
    destinations: ["Amazon S3 · processed/", "Folder · /srv/out"],
    // Not a classifier confidence: any step that reports one can hold a file, and
    // the reason names the step instead of a label.
    reasons: [
      {
        kind: "LOW_CONFIDENCE",
        labelId: "page 3",
        confidence: 0.42,
        detail: "faint scan",
        producer: "OCR",
      },
    ],
  }),
  item({
    id: "failed-run",
    createdAt: BASE - 5 * HOUR,
    filesAreInputs: true,
    reasons: [
      {
        kind: "RUN_FAILED",
        labelId: null,
        confidence: null,
        detail: "Policy run failed: connection timed out",
      },
    ],
  }),
];

const RESOLVED: ReviewItem[] = [
  item({
    id: "old-invoice",
    status: "APPROVED",
    createdAt: BASE - 30 * HOUR,
    resolvedAt: BASE - 29 * HOUR,
    resolvedBy: "ethan@stirlingpdf.com",
    reasons: [
      {
        kind: "WATCHED_LABEL",
        labelId: "invoice",
        confidence: 0.99,
        detail: null,
      },
    ],
    labels: [{ labelId: "invoice", confidence: 0.99 }],
  }),
  item({
    id: "old-junk",
    status: "REJECTED",
    filesAreInputs: true,
    createdAt: BASE - 40 * HOUR,
    resolvedAt: BASE - 39 * HOUR,
    resolvedBy: "ethan@stirlingpdf.com",
    reasons: [
      { kind: "RUN_FAILED", labelId: null, confidence: null, detail: "boom" },
    ],
  }),
];

const withItems = (items: ReviewItem[]) => ({
  msw: {
    handlers: [
      http.get("*/api/v1/review/items", () => HttpResponse.json({ items })),
      http.get("*/api/v1/review/items/:id/files/:fileId", () =>
        HttpResponse.arrayBuffer(buildReviewPdfBytes().buffer as ArrayBuffer, {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
      http.get("*/api/v1/policies/:id", ({ params }) =>
        HttpResponse.json({
          id: params.id,
          name: "Webhook -> S3 test",
          enabled: true,
          trigger: { type: "webhook", options: {} },
          sourceIds: ["src-1"],
          steps: [
            {
              operation: "/api/v1/ai/tools/classify-and-label",
              parameters: {},
            },
            { operation: "/api/v1/security/add-watermark", parameters: {} },
          ],
          output: { type: "s3", options: {} },
        }),
      ),
      http.post("*/api/v1/review/items/bulk/approve", () =>
        HttpResponse.json({ succeeded: items.length, failures: [] }),
      ),
      http.post("*/api/v1/review/items/bulk/reject", () =>
        HttpResponse.json({ succeeded: items.length, failures: [] }),
      ),
      http.get("*/api/v1/review/config", () =>
        HttpResponse.json({
          enabled: true,
          watchedLabelIds: ["invoice"],
          holdFailedRuns: true,
          holdUnlabeled: false,
          holdLowConfidence: true,
          confidenceThreshold: 0.8,
        }),
      ),
    ],
  },
});

const meta: Meta<typeof Review> = {
  title: "Portal/Views/Review",
  component: Review,
  parameters: { layout: "fullscreen", ...withItems([...ITEMS, ...RESOLVED]) },
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <Story />
      </QueryClientProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Review>;

/** Populated queue: filter bar, reason chips, sortable Held column. */
export const Default: Story = {};

/** Nothing held yet. */
export const Empty: Story = { parameters: withItems([]) };
