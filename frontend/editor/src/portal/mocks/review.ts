import type { ReviewConfig, ReviewItem } from "@portal/api/review";

/** The backend's out-of-the-box configuration (review bucket off). */
export function buildReviewConfig(
  overrides: Partial<ReviewConfig> = {},
): ReviewConfig {
  return {
    enabled: false,
    watchedLabelIds: [],
    holdFailedRuns: true,
    holdUnlabeled: false,
    holdLowConfidence: true,
    confidenceThreshold: 0.8,
    ...overrides,
  };
}

const HOURS = 3_600_000;

/** A spread of held items exercising every reason kind and both resolutions. */
export function buildReviewItems(now = Date.now()): ReviewItem[] {
  return [
    {
      id: "ri-1",
      runId: "run-1",
      policyId: "p-1",
      policyName: "Classification Policy",
      status: "PENDING",
      createdAt: now - 2 * HOURS,
      resolvedAt: null,
      resolvedBy: null,
      files: [{ fileId: "f-1", fileName: "scan-004.pdf" }],
      reasons: [
        {
          kind: "WATCHED_LABEL",
          labelId: "medical-form",
          confidence: 0.93,
          detail: null,
        },
      ],
      labels: [{ labelId: "medical-form", confidence: 0.93 }],
      filesAreInputs: false,
      destinations: ["Amazon S3 · processed/"],
    },
    {
      id: "ri-2",
      runId: "run-2",
      policyId: "p-1",
      policyName: "Classification Policy",
      status: "PENDING",
      createdAt: now - 26 * HOURS,
      resolvedAt: null,
      resolvedBy: null,
      files: [{ fileId: "f-2", fileName: "statement-jan.pdf" }],
      reasons: [
        {
          kind: "LOW_CONFIDENCE",
          labelId: "invoice",
          confidence: 0.55,
          detail: null,
        },
        {
          kind: "SKIPPED_LABEL",
          labelId: "medical-form",
          confidence: 0.35,
          detail: "mentions a patient but reads as billing",
        },
      ],
      labels: [{ labelId: "invoice", confidence: 0.55 }],
      filesAreInputs: false,
      destinations: ["Amazon S3 · processed/"],
    },
    {
      id: "ri-3",
      runId: "run-3",
      policyId: "p-1",
      policyName: "Classification Policy",
      status: "PENDING",
      createdAt: now - 3 * 24 * HOURS,
      resolvedAt: null,
      resolvedBy: null,
      files: [{ fileId: "f-3", fileName: "untitled-scan.pdf" }],
      reasons: [
        { kind: "NO_LABEL", labelId: null, confidence: null, detail: null },
      ],
      labels: [],
      filesAreInputs: false,
      destinations: ["Amazon S3 · processed/"],
    },
    {
      id: "ri-4",
      runId: "run-4",
      policyId: "p-2",
      policyName: "Security Policy",
      status: "PENDING",
      createdAt: now - 5 * 24 * HOURS,
      resolvedAt: null,
      resolvedBy: null,
      files: [{ fileId: "f-4", fileName: "contract-draft.pdf" }],
      reasons: [
        {
          kind: "RUN_FAILED",
          labelId: null,
          confidence: null,
          detail: "Usage limit reached",
        },
      ],
      labels: [],
      filesAreInputs: true,
      destinations: ["Amazon S3 · processed/"],
    },
    {
      id: "ri-5",
      runId: "run-5",
      policyId: "p-1",
      policyName: "Classification Policy",
      status: "APPROVED",
      createdAt: now - 7 * 24 * HOURS,
      resolvedAt: now - 6 * 24 * HOURS,
      resolvedBy: "you@acme.com",
      files: [{ fileId: "f-5", fileName: "invoice-4411.pdf" }],
      reasons: [
        {
          kind: "LOW_CONFIDENCE",
          labelId: "invoice",
          confidence: 0.71,
          detail: null,
        },
      ],
      labels: [{ labelId: "invoice", confidence: 0.71 }],
      filesAreInputs: false,
      destinations: ["Amazon S3 · processed/"],
    },
    {
      id: "ri-6",
      runId: "run-6",
      policyId: "p-1",
      policyName: "Classification Policy",
      status: "REJECTED",
      createdAt: now - 9 * 24 * HOURS,
      resolvedAt: now - 8 * 24 * HOURS,
      resolvedBy: "legal-ops@acme.com",
      files: [{ fileId: "f-6", fileName: "old-medical-record.pdf" }],
      reasons: [
        {
          kind: "WATCHED_LABEL",
          labelId: "medical-form",
          confidence: 0.97,
          detail: null,
        },
      ],
      labels: [{ labelId: "medical-form", confidence: 0.97 }],
      filesAreInputs: false,
      destinations: ["Amazon S3 · processed/"],
    },
  ];
}

/** A tiny but valid one-page PDF, for the held-file download endpoint. */
export function buildReviewPdfBytes(): Uint8Array {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}
