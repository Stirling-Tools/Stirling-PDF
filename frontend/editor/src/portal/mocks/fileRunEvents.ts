/**
 * Fixtures for recorded policy failures, for mock mode, Storybook and tests.
 *
 * Chosen to cover the states the UI handles rather than to look tidy: a classified
 * failure with per-kind labels, an unclassified one, a repeat-folded incident, and
 * a closed row whose actions come back disabled.
 */

import type { FileRunEvent } from "@portal/api/fileRunEvents";

const HOUR = 3_600_000;

/** Fixed base so fixtures are stable across renders and snapshots. */
const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);

function acknowledgeOffer(enabled = true, labelKey?: string) {
  return {
    id: "ACKNOWLEDGE",
    labelKey: labelKey ?? "portal.failures.action.acknowledge",
    enabled,
    disabledReasonKey: enabled ? null : "portal.failures.disabled.closed",
  };
}

function dismissOffer(enabled = true, labelKey?: string) {
  return {
    id: "DISMISS",
    labelKey: labelKey ?? "portal.failures.action.dismiss",
    enabled,
    disabledReasonKey: enabled ? null : "portal.failures.disabled.closed",
  };
}

export const FILE_RUN_EVENTS: FileRunEvent[] = [
  {
    id: "fre-1",
    kindId: "INPUT_PASSWORD_PROTECTED",
    stage: "INPUT",
    severity: "ERROR",
    scope: "FILE",
    origin: "PROCESSOR",
    remedy: "NEEDS_USER_INPUT",
    titleKey: "portal.failures.kind.inputPasswordProtected.title",
    descriptionKey: "portal.failures.kind.inputPasswordProtected.description",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded and the password was not provided",
    policyId: "policy-contract-redaction",
    runId: "run-8841",
    fileId: "f-8841a",
    actor: "dana@example.com",
    occurrences: 1,
    status: "NEW",
    statusActor: null,
    actions: [
      acknowledgeOffer(true, "portal.failures.action.acknowledgeUnlock"),
      dismissOffer(true, "portal.failures.action.dismissSkipFile"),
    ],
    createdAt: NOW - HOUR,
    lastSeenAt: NOW - HOUR,
  },
  {
    id: "fre-2",
    kindId: "UNKNOWN",
    stage: "INTERNAL",
    severity: "ERROR",
    scope: "RUN",
    origin: "PROCESSOR",
    remedy: "PERMANENT",
    titleKey: "portal.failures.kind.unknown.title",
    descriptionKey: "portal.failures.kind.unknown.description",
    defaultTitle: "Unrecognised failure",
    // An unclassified row's raw message is the whole diagnostic, so this is realistic.
    detail:
      "Policy run failed: Tool returned HTTP 500 INTERNAL_SERVER_ERROR for /api/v1/misc/ocr-pdf",
    policyId: "policy-invoice-ocr",
    runId: "run-8839",
    fileId: "f-8839b",
    actor: "sam@example.com",
    occurrences: 12,
    status: "ACKNOWLEDGED",
    statusActor: "ops@example.com",
    actions: [acknowledgeOffer(), dismissOffer()],
    createdAt: NOW - 6 * HOUR,
    lastSeenAt: NOW - 2 * HOUR,
  },
  {
    id: "fre-3",
    kindId: "INPUT_PASSWORD_PROTECTED",
    stage: "INPUT",
    severity: "ERROR",
    scope: "FILE",
    origin: "PROCESSOR",
    remedy: "NEEDS_USER_INPUT",
    titleKey: "portal.failures.kind.inputPasswordProtected.title",
    descriptionKey: "portal.failures.kind.inputPasswordProtected.description",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded and the password was not provided",
    policyId: "policy-contract-redaction",
    runId: "run-8790",
    fileId: "f-8790c",
    actor: "dana@example.com",
    // Closed rows keep their actions, disabled with a reason, so the reviewer
    // can still see what was possible.
    occurrences: 3,
    status: "DISMISSED",
    statusActor: "ops@example.com",
    actions: [
      acknowledgeOffer(false, "portal.failures.action.acknowledgeUnlock"),
      dismissOffer(false, "portal.failures.action.dismissSkipFile"),
    ],
    createdAt: NOW - 30 * HOUR,
    lastSeenAt: NOW - 26 * HOUR,
  },
];
