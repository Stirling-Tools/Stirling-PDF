import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { NotificationActionContext } from "@app/components/notifications/notificationActions";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";
import type { RetryPayload } from "@app/services/notificationRetry";

// Fixtures shared by the registry test and each resolution's own. The mocks stay in the test
// files: vi.mock is hoisted per file, so a helper cannot own them.

export function notification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: "failure:evt-1",
    source: "FAILURE",
    kindId: "INPUT_PASSWORD_PROTECTED",
    origin: "TOOL",
    ownership: "MINE",
    severity: "ERROR",
    status: "NEW",
    titleKey: "portal.failures.kind.inputPasswordProtected.title",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded",
    fileId: "f-1",
    sourceId: null,
    policyId: null,
    occurrences: 3,
    createdAt: "2026-08-06T00:00:00Z",
    lastSeenAt: "2026-08-06T00:00:00Z",
    actions: [],
    ...overrides,
  };
}

export function offer(id: string): NotificationActionOffer {
  return {
    id,
    labelKey: `portal.failures.action.${id.toLowerCase()}`,
    defaultLabel: id,
    slot: "SECONDARY",
    enabled: true,
    disabledReasonKey: null,
  };
}

/** The stash a failure of `kindId` would have left: the operation that failed, with its code. */
function payloadFor(kindId: string): RetryPayload {
  if (kindId === "INPUT_CORRUPTED") {
    return {
      operation: "compress",
      endpoint: "/api/v1/misc/compress-pdf",
      params: { level: "5" },
      fileIds: ["f-1"],
      multiFile: false,
      errorCode: "E001",
      replayUnfaithful: false,
      recordedAt: 0,
    };
  }
  return {
    operation: "removePassword",
    endpoint: "/api/v1/security/remove-password",
    params: {},
    fileIds: ["f-1"],
    multiFile: false,
    errorCode: "E004",
    replayUnfaithful: false,
    recordedAt: 0,
  };
}

export interface ContextOverrides extends Partial<NotificationActionContext> {
  kindId?: string;
}

/** A tool failure the server classified as `kindId`, with its stash still here. */
export function context({
  kindId = "INPUT_PASSWORD_PROTECTED",
  ...overrides
}: ContextOverrides = {}): NotificationActionContext {
  return {
    notification: notification({ kindId }),
    hasLocalFile: true,
    retryPayload: payloadFor(kindId),
    ...overrides,
  };
}

/** An attended policy run: the row names the policy and the document, and nothing was stashed. */
export function policyContext({
  kindId = "INPUT_PASSWORD_PROTECTED",
  ...overrides
}: ContextOverrides = {}): NotificationActionContext {
  return {
    notification: notification({
      kindId,
      origin: "POLICY",
      policyId: "pol-1",
      sourceId: null,
    }),
    hasLocalFile: true,
    retryPayload: null,
    ...overrides,
  };
}

/** The processor shell: the portal mounts above the app's providers, so there is none. */
export const inProcessor = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

/** A file's own bytes. Via FileReader because this environment's Blob has no `text`. */
export function bytesOf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
