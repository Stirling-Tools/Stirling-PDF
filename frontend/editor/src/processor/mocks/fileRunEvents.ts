/**
 * Fixtures for recorded policy failures, for mock mode, Storybook and tests.
 *
 * Chosen to cover the states the UI handles rather than to look tidy: a classified
 * failure with per-kind labels, an unclassified one, a repeat-folded incident, and
 * a closed row whose actions come back disabled.
 */

import type { FileRunEvent } from "@processor/api/fileRunEvents";

const HOUR = 3_600_000;

/** Fixed base so fixtures are stable across renders and snapshots. */
const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);

function acknowledgeOffer(enabled = true, labelKey?: string) {
  return {
    id: "ACKNOWLEDGE",
    labelKey: labelKey ?? "processor.failures.action.acknowledge",
    enabled,
    disabledReasonKey: enabled ? null : "processor.failures.disabled.closed",
  };
}

function dismissOffer(enabled = true, labelKey?: string) {
  return {
    id: "DISMISS",
    labelKey: labelKey ?? "processor.failures.action.dismiss",
    enabled,
    disabledReasonKey: enabled ? null : "processor.failures.disabled.closed",
  };
}

export const FILE_RUN_EVENTS: FileRunEvent[] = [
  {
    id: "fre-1",
    kindId: "INPUT_PASSWORD_PROTECTED",
    stage: "INPUT",
    severity: "ERROR",
    scope: "FILE",
    origin: "POLICY",
    remedy: "NEEDS_USER_INPUT",
    titleKey: "processor.failures.kind.inputPasswordProtected.title",
    descriptionKey:
      "processor.failures.kind.inputPasswordProtected.description",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded and the password was not provided",
    policyId: "policy-contract-redaction",
    runId: "run-8841",
    sourceId: null,
    fileId: "f-8841a",
    actor: "dana@example.com",
    occurrences: 1,
    status: "NEW",
    statusActor: null,
    actions: [
      acknowledgeOffer(true, "processor.failures.action.acknowledge"),
      dismissOffer(true, "processor.failures.action.dismissSkipFile"),
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
    origin: "POLICY",
    remedy: "PERMANENT",
    titleKey: "processor.failures.kind.unknown.title",
    descriptionKey: "processor.failures.kind.unknown.description",
    defaultTitle: "Unrecognised failure",
    // An unclassified row's raw message is the whole diagnostic, so this is realistic.
    detail:
      "Policy run failed: Tool returned HTTP 500 INTERNAL_SERVER_ERROR for /api/v1/misc/ocr-pdf",
    policyId: "policy-invoice-ocr",
    runId: "run-8839",
    sourceId: "src-s3-invoices",
    fileId: "f-8839b",
    // Unattended: arrived from a bucket, so there is no user to name.
    actor: null,
    occurrences: 12,
    status: "NEW",
    statusActor: null,
    // Nothing to fix, so the only decision is whether to clear it.
    actions: [dismissOffer()],
    createdAt: NOW - 6 * HOUR,
    lastSeenAt: NOW - 2 * HOUR,
  },
  {
    id: "fre-editor-1",
    kindId: "UNKNOWN",
    stage: "INTERNAL",
    severity: "ERROR",
    scope: "FILE",
    origin: "TOOL",
    remedy: "PERMANENT",
    titleKey: "processor.failures.kind.unknown.title",
    descriptionKey: "processor.failures.kind.unknown.description",
    defaultTitle: "Unrecognised failure",
    // Reported by the user's own client, so there is no run to reference.
    detail: "compress: Request failed with status code 500",
    policyId: null,
    runId: null,
    sourceId: null,
    fileId: "f-editor-77",
    actor: "priya@example.com",
    occurrences: 1,
    status: "NEW",
    statusActor: null,
    actions: [dismissOffer()],
    createdAt: NOW - 3 * HOUR,
    lastSeenAt: NOW - 3 * HOUR,
  },
  {
    id: "fre-editor-2",
    kindId: "INPUT_PASSWORD_PROTECTED",
    stage: "INPUT",
    severity: "ERROR",
    scope: "FILE",
    origin: "TOOL",
    remedy: "NEEDS_USER_INPUT",
    titleKey: "processor.failures.kind.inputPasswordProtected.title",
    descriptionKey:
      "processor.failures.kind.inputPasswordProtected.description",
    defaultTitle: "Password-protected document",
    detail: "remove-password: The PDF Document is passworded",
    policyId: null,
    runId: null,
    sourceId: null,
    fileId: "f-editor-91",
    // A colleague's own upload: the reviewer sees it, but unlocking is not theirs to do.
    actor: "sam@example.com",
    occurrences: 1,
    status: "NEW",
    statusActor: null,
    // A colleague's own upload. Nothing here acts on the document, so triage is just
    // acknowledging or clearing the row.
    actions: [dismissOffer(true, "processor.failures.action.dismissSkipFile")],
    createdAt: NOW - 4 * HOUR,
    lastSeenAt: NOW - 4 * HOUR,
  },
  {
    id: "fre-3",
    kindId: "INPUT_PASSWORD_PROTECTED",
    stage: "INPUT",
    severity: "ERROR",
    scope: "FILE",
    origin: "POLICY",
    remedy: "NEEDS_USER_INPUT",
    titleKey: "processor.failures.kind.inputPasswordProtected.title",
    descriptionKey:
      "processor.failures.kind.inputPasswordProtected.description",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded and the password was not provided",
    policyId: "policy-contract-redaction",
    runId: "run-8790",
    sourceId: null,
    fileId: "f-8790c",
    actor: "dana@example.com",
    // Closed rows keep their actions, disabled with a reason, so the reviewer
    // can still see what was possible.
    occurrences: 3,
    status: "DISMISSED",
    statusActor: "ops@example.com",
    actions: [
      acknowledgeOffer(false, "processor.failures.action.acknowledge"),
      dismissOffer(false, "processor.failures.action.dismissSkipFile"),
    ],
    createdAt: NOW - 30 * HOUR,
    lastSeenAt: NOW - 26 * HOUR,
  },
];
