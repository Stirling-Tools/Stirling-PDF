/**
 * Policies fixtures. The canonical TS model and the static catalogue
 * definitions live in api/policies.ts (the backend contract); this module
 * only builds seed data for the MSW handlers and tests.
 */

import type { PolicyRunView, WirePolicy } from "@app/policies/types";
import { POLICY_CONFIG } from "@portal/api/policies";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Seed data — real backend wire format                                      */
/* ──────────────────────────────────────────────────────────────────────── */

export function seedPolicies(): WirePolicy[] {
  return [
    {
      id: "pol_security_default",
      name: "Security Policy",
      owner: "security@acme.com",
      enabled: true,
      trigger: null,
      steps: POLICY_CONFIG.security.defaultOperations,
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
  ];
}

const NOW = Date.now();
const M = 60000;
const H = 3600000;
const D = 86400000;

/** Seed `PolicyRunView` records that drive the activity feed + stats. */
export function seedPolicyRuns(): PolicyRunView[] {
  return [
    {
      runId: "run_001",
      policyId: "pol_security_default",
      status: "COMPLETED",
      currentStep: 2,
      stepCount: 2,
      error: null,
      outputs: [{ fileId: "f1", fileName: "Q2-vendor-agreement.pdf" }],
      createdAt: NOW - 12 * M,
    },
    {
      runId: "run_002",
      policyId: "pol_security_default",
      status: "FAILED",
      currentStep: 1,
      stepCount: 2,
      error: "Low-confidence match — routed for review",
      outputs: [{ fileId: "f2", fileName: "patient-intake-0481.pdf" }],
      createdAt: NOW - 1 * H,
    },
    {
      runId: "run_003",
      policyId: "pol_security_default",
      status: "RUNNING",
      currentStep: 1,
      stepCount: 2,
      error: null,
      outputs: [{ fileId: "f3", fileName: "invoice-7782.pdf" }],
      createdAt: NOW - 2 * M,
    },
    // Older completed runs for stats
    ...Array.from({ length: 4818 }, (_, i) => ({
      runId: `run_old_${i}`,
      policyId: "pol_security_default",
      status: "COMPLETED" as const,
      currentStep: 2,
      stepCount: 2,
      error: null,
      outputs: [] as { fileId: string; fileName: string }[],
      createdAt: NOW - (34 * D + i * 10 * M),
    })),
  ];
}
