/** Policies seed data for the MSW handlers and tests. The canonical model and
 *  catalogue live in api/policies.ts (the backend contract). */

import type {
  PolicyRunView,
  WirePipelineStep,
  WirePolicy,
} from "@app/policies/types";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Seed data — real backend wire format                                      */
/* ──────────────────────────────────────────────────────────────────────── */

// Literal wire steps (not derived from the catalogue) so this fixtures module stays independent of
// @portal/api/policies and its heavy tool-operation import graph.
const SECURITY_STEPS: WirePipelineStep[] = [
  {
    operation: "/api/v1/security/auto-redact",
    parameters: {
      listOfText: "",
      useRegex: true,
      convertPDFToImage: true,
    },
  },
  {
    operation: "/api/v1/security/sanitize-pdf",
    parameters: { removeJavaScript: true },
  },
];

const CLASSIFICATION_STEPS: WirePipelineStep[] = [
  { operation: "/api/v1/ai/tools/classify-and-label", parameters: {} },
];

export function seedPolicies(): WirePolicy[] {
  return [
    {
      id: "pol_security_default",
      name: "Security Policy",
      owner: "security@acme.com",
      enabled: true,
      trigger: null,
      steps: SECURITY_STEPS,
      output: {
        type: "inline",
        options: {
          runOn: "upload",
          mode: "new_version",
          name: "",
          position: "suffix",
          maxRetries: 3,
          retryDelayMinutes: 5,
          categoryId: "security",
          sources: ["src-claims"],
          scopeTypes: [],
          reviewerEmail: "security@acme.com",
          fieldValues: {},
        },
      },
    },
    {
      id: "pol_classification_default",
      name: "Classification Policy",
      owner: "data-eng@acme.com",
      enabled: true,
      trigger: null,
      steps: CLASSIFICATION_STEPS,
      output: {
        type: "inline",
        options: {
          runOn: "upload",
          mode: "new_version",
          name: "",
          position: "suffix",
          maxRetries: 3,
          retryDelayMinutes: 5,
          categoryId: "classification",
          sources: ["src-contracts"],
          scopeTypes: [],
          reviewerEmail: "data-eng@acme.com",
          fieldValues: {},
        },
      },
    },
  ];
}

const NOW = Date.now();
const M = 60000;
const D = 86400000;

/** Seed runs: 40 delivered + 3 failed in the last 24h (split across the two
 *  active policies), plus a tail of older completed runs for lifetime stats. */
export function seedPolicyRuns(): PolicyRunView[] {
  // Split throughput across security / classification so both show a 24h count
  // and the Sankey waist splits into two segments.
  const policyFor = (i: number, total: number) =>
    i < Math.round(total * 0.6)
      ? "pol_security_default"
      : "pol_classification_default";
  // 40 successful runs spread across the last ~13h.
  const delivered = Array.from({ length: 40 }, (_, i) => ({
    runId: `run_ok_${i}`,
    policyId: policyFor(i, 40),
    status: "COMPLETED" as const,
    currentStep: 2,
    stepCount: 2,
    error: null,
    outputs: [{ fileId: `f${i}`, fileName: `document-${i + 1}.pdf` }],
    createdAt: NOW - i * 20 * M,
  }));
  // 3 failures within the last few hours.
  const failed = Array.from({ length: 3 }, (_, i) => ({
    runId: `run_fail_${i}`,
    policyId: policyFor(i, 3),
    status: "FAILED" as const,
    currentStep: 1,
    stepCount: 2,
    error: "Low-confidence match — routed for review",
    outputs: [{ fileId: `ff${i}`, fileName: `flagged-${i + 1}.pdf` }],
    createdAt: NOW - (i + 1) * 90 * M,
  }));
  // Older completed runs (>24h) for lifetime stats — excluded from 24h counts.
  const older = Array.from({ length: 4800 }, (_, i) => ({
    runId: `run_old_${i}`,
    policyId: "pol_security_default",
    status: "COMPLETED" as const,
    currentStep: 2,
    stepCount: 2,
    error: null,
    outputs: [] as { fileId: string; fileName: string }[],
    createdAt: NOW - (34 * D + i * 10 * M),
  }));
  return [...delivered, ...failed, ...older];
}
