import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";
import type { SucceededToolRun } from "@app/hooks/tools/shared/useResolutionContinuation";

// A manual run that IS an open failure's fix closes the row, under the rules the bell obeys.

const fetchNotifications = vi.fn();
const reportNotificationResolved = vi.fn();
vi.mock("@app/services/notifications", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
  reportNotificationResolved: (...args: unknown[]) =>
    reportNotificationResolved(...args),
}));

const refreshNotificationsNow = vi.fn();
vi.mock("@app/hooks/useNotifications", () => ({
  refreshNotificationsNow: () => refreshNotificationsNow(),
}));

const loadRetryPayload = vi.fn();
vi.mock("@app/services/notificationRetry", async (importOriginal) => ({
  // The real stashMatchesKind: pure, and part of the behaviour under test.
  ...(await importOriginal<typeof import("@app/services/notificationRetry")>()),
  loadRetryPayload: (fileId: string) => loadRetryPayload(fileId),
}));

const rechainPolicyOnDocument = vi.fn();
vi.mock("@app/services/notificationPolicyRetry", () => ({
  rechainPolicyOnDocument: (...args: unknown[]) =>
    rechainPolicyOnDocument(...args),
}));

vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => true,
}));

const { useResolutionContinuation } =
  await import("@app/hooks/tools/shared/useResolutionContinuation");

function offer(
  id: string,
  slot: NotificationActionOffer["slot"],
  enabled = true,
): NotificationActionOffer {
  return {
    id,
    labelKey: `portal.failures.action.${id.toLowerCase()}`,
    defaultLabel: id,
    slot,
    enabled,
    disabledReasonKey: enabled ? null : "portal.failures.disabled.closed",
  };
}

/** An attended policy failure of the reader's own, with the fix on offer. */
function policyRow(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "failure:evt-1",
    source: "FAILURE",
    kindId: "INPUT_PASSWORD_PROTECTED",
    origin: "POLICY",
    ownership: "MINE",
    severity: "ERROR",
    status: "NEW",
    titleKey: "portal.failures.kind.inputPasswordProtected.title",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded",
    fileId: "f-locked",
    sourceId: null,
    policyId: "pol-1",
    occurrences: 1,
    createdAt: "2026-08-06T00:00:00Z",
    lastSeenAt: "2026-08-06T00:00:00Z",
    actions: [
      offer("DECRYPT", "RESOLUTION"),
      offer("VIEW_FILE", "SECONDARY"),
      offer("OPEN_IN_TOOL", "OVERFLOW"),
    ],
    ...overrides,
  };
}

/** A tool failure of the reader's own, with its retry on offer. */
function toolRow(overrides: Partial<AppNotification> = {}): AppNotification {
  return policyRow({
    id: "failure:evt-2",
    kindId: "UNKNOWN",
    origin: "TOOL",
    policyId: null,
    fileId: "f-tool",
    actions: [
      offer("OPEN_IN_TOOL", "SECONDARY"),
      offer("VIEW_FILE", "SECONDARY"),
    ],
    ...overrides,
  });
}

function unlockRun(
  overrides: Partial<SucceededToolRun> = {},
): SucceededToolRun {
  return {
    operation: "removePassword",
    inputFileIds: ["f-locked"],
    outputs: [
      {
        file: new File(["pdf"], "unlocked.pdf", { type: "application/pdf" }),
        fileId: "f-unlocked",
        sourceFileId: "f-locked",
      },
    ],
    ...overrides,
  };
}

function continuation() {
  return renderHook(() => useResolutionContinuation()).result.current;
}

beforeEach(() => {
  fetchNotifications.mockReset().mockResolvedValue({
    notifications: [],
    viewerReviewsTeam: true,
  });
  reportNotificationResolved.mockReset().mockResolvedValue(true);
  refreshNotificationsNow.mockReset();
  loadRetryPayload.mockReset().mockResolvedValue(null);
  rechainPolicyOnDocument
    .mockReset()
    .mockResolvedValue({ ok: true, tracked: true });
});

describe("useResolutionContinuation", () => {
  it("carries a manual unlock through the failed policy and closes the row", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow()],
      viewerReviewsTeam: false,
    });

    continuation()(unlockRun());

    await waitFor(() =>
      expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1"),
    );
    // The ORIGINAL reference so a repeat folds on, attributed to the run's own output.
    expect(rechainPolicyOnDocument).toHaveBeenCalledWith(
      { policyId: "pol-1", fileId: "f-locked" },
      expect.any(File),
      "f-unlocked",
    );
    expect(refreshNotificationsNow).toHaveBeenCalled();
  });

  it("costs no read at all for a run that could not resolve anything", async () => {
    continuation()({
      operation: "compress",
      inputFileIds: ["f-1"],
      outputs: [],
    });

    // loadRetryPayload settles first, so give the async path a beat to prove the negative.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchNotifications).not.toHaveBeenCalled();
  });

  it("leaves the row open when the re-run cannot be delivered", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow()],
      viewerReviewsTeam: false,
    });
    rechainPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    continuation()(unlockRun());

    await waitFor(() => expect(rechainPolicyOnDocument).toHaveBeenCalled());
    expect(reportNotificationResolved).not.toHaveBeenCalled();
    expect(refreshNotificationsNow).not.toHaveBeenCalled();
  });

  it("leaves the row open when the server refuses the re-run", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow()],
      viewerReviewsTeam: false,
    });
    rechainPolicyOnDocument.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: "gone",
    });

    continuation()(unlockRun());

    await waitFor(() => expect(rechainPolicyOnDocument).toHaveBeenCalled());
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("respects a withheld resolution: the server said no, however the fix arrived", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [
        policyRow({
          actions: [
            offer("DECRYPT", "RESOLUTION", false),
            offer("VIEW_IN_PROCESSOR", "OVERFLOW"),
          ],
        }),
      ],
      viewerReviewsTeam: true,
    });

    continuation()(unlockRun());

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("never closes a colleague's incident, even having fixed their document", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow({ ownership: "THEIRS" })],
      viewerReviewsTeam: true,
    });

    continuation()(unlockRun());

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("leaves an unattended row alone: its reference was never this browser's", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow({ sourceId: "src-1" })],
      viewerReviewsTeam: true,
    });

    continuation()(unlockRun());

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("skips a row whose output it cannot name rather than guessing one", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow()],
      viewerReviewsTeam: false,
    });

    // Two inputs, two outputs, no provenance: which is the unlocked document is a guess.
    continuation()(
      unlockRun({
        inputFileIds: ["f-locked", "f-other"],
        outputs: [
          {
            file: new File(["a"], "a.pdf"),
            fileId: "out-1",
            sourceFileId: null,
          },
          {
            file: new File(["b"], "b.pdf"),
            fileId: "out-2",
            sourceFileId: null,
          },
        ],
      }),
    );

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
  });

  it("pairs by provenance when a run versioned several inputs at once", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow()],
      viewerReviewsTeam: false,
    });

    continuation()(
      unlockRun({
        inputFileIds: ["f-other", "f-locked"],
        outputs: [
          {
            file: new File(["a"], "a.pdf"),
            fileId: "out-other",
            sourceFileId: "f-other",
          },
          {
            file: new File(["b"], "b.pdf"),
            fileId: "out-locked",
            sourceFileId: "f-locked",
          },
        ],
      }),
    );

    await waitFor(() => expect(rechainPolicyOnDocument).toHaveBeenCalled());
    expect(rechainPolicyOnDocument.mock.calls[0][2]).toBe("out-locked");
  });

  it("resolves a tool failure when the operation that failed succeeds on its document", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [toolRow()],
      viewerReviewsTeam: false,
    });
    loadRetryPayload.mockResolvedValue({
      operation: "compress",
      endpoint: "/api/v1/misc/compress-pdf",
      params: {},
      fileIds: ["f-tool"],
      recordedAt: 0,
    });

    continuation()({
      operation: "compress",
      inputFileIds: ["f-tool"],
      outputs: [
        {
          file: new File(["pdf"], "smaller.pdf"),
          fileId: "f-out",
          sourceFileId: "f-tool",
        },
      ],
    });

    await waitFor(() =>
      expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-2"),
    );
    // Nothing further to run: the failed operation itself is what just succeeded.
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(refreshNotificationsNow).toHaveBeenCalled();
  });

  it("re-runs nothing from a success that is not the row's declared resolution", async () => {
    // The failure wants an unlock; a compress on the same document fixes nothing it is about.
    fetchNotifications.mockResolvedValue({
      notifications: [policyRow()],
      viewerReviewsTeam: false,
    });
    // The stash lets it past the local gate, so the kind check is what refuses it.
    loadRetryPayload.mockResolvedValue({
      operation: "compress",
      endpoint: "/api/v1/misc/compress-pdf",
      params: {},
      fileIds: ["f-locked"],
      recordedAt: 0,
    });

    continuation()({
      operation: "compress",
      inputFileIds: ["f-locked"],
      outputs: [
        {
          file: new File(["pdf"], "smaller.pdf"),
          fileId: "f-out",
          sourceFileId: "f-locked",
        },
      ],
    });

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("does not resolve a file its batch run failed for", async () => {
    // Being an input of a successful run proves nothing; producing an output does.
    fetchNotifications.mockResolvedValue({
      notifications: [toolRow()],
      viewerReviewsTeam: false,
    });
    loadRetryPayload.mockResolvedValue({
      operation: "compress",
      endpoint: "/api/v1/misc/compress-pdf",
      params: {},
      fileIds: ["f-tool", "f-other"],
      multiFile: false,
      errorCode: null,
      recordedAt: 0,
    });

    continuation()({
      operation: "compress",
      inputFileIds: ["f-tool", "f-other"],
      // Only the other file produced an output; f-tool failed again, silently.
      outputs: [
        {
          file: new File(["pdf"], "other.pdf"),
          fileId: "f-other-out",
          sourceFileId: "f-other",
        },
      ],
    });

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("does not resolve a row whose stash another kind's failure wrote", async () => {
    // The password failure's stash overwrote the compress one, so that row cannot use it.
    fetchNotifications.mockResolvedValue({
      notifications: [toolRow()],
      viewerReviewsTeam: false,
    });
    loadRetryPayload.mockResolvedValue({
      operation: "removePassword",
      endpoint: "/api/v1/security/remove-password",
      params: {},
      fileIds: ["f-tool"],
      multiFile: false,
      errorCode: "E004",
      recordedAt: 0,
    });

    continuation()({
      operation: "removePassword",
      inputFileIds: ["f-tool"],
      outputs: [
        {
          file: new File(["pdf"], "unlocked.pdf"),
          fileId: "f-out",
          sourceFileId: "f-tool",
        },
      ],
    });

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("does not resolve a tool failure from a different operation's success", async () => {
    fetchNotifications.mockResolvedValue({
      notifications: [toolRow()],
      viewerReviewsTeam: false,
    });
    // The stash says compress failed; what succeeded is OCR on the same document.
    loadRetryPayload.mockResolvedValue({
      operation: "compress",
      endpoint: "/api/v1/misc/compress-pdf",
      params: {},
      fileIds: ["f-tool"],
      recordedAt: 0,
    });

    continuation()({
      operation: "ocr",
      inputFileIds: ["f-tool"],
      outputs: [],
    });

    // The stash matched nothing, so this never even reached the network.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });
});
