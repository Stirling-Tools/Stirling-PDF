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
const D = 86400000;

/** Seed `PolicyRunView` records that drive the activity feed + stats.
 * 40 delivered + 3 failed within the trailing 24h so the home visualiser shows
 * a lively flow; a tail of older completed runs keeps the lifetime stats real. */
export function seedPolicyRuns(): PolicyRunView[] {
  // 40 successful runs spread across the last ~13h.
  const delivered = Array.from({ length: 40 }, (_, i) => ({
    runId: `run_ok_${i}`,
    policyId: "pol_security_default",
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
    policyId: "pol_security_default",
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
