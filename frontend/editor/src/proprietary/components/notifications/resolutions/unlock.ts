import {
  retryWithPassword,
  unlockLocalDocument,
} from "@app/services/notificationRetry";
import type { FileId } from "@app/types/file";
import {
  asFiles,
  type Resolution,
} from "@app/components/notifications/resolutions/resolution";

export const unlock: Resolution = {
  actionId: "DECRYPT",
  toolId: "removePassword",
  needsPassword: true,
  async produce(target, context, password) {
    // The stash knows a tool's parameters; a locked policy input just needs unlocking. Either
    // way the call IS the re-run, which is why this fix declares no toolRerun.
    const outcome =
      target.kind === "tool"
        ? await retryWithPassword(
            target.payload,
            password ?? "",
            context.notification.fileId,
          )
        : await unlockLocalDocument(target.policy.fileId, password ?? "");
    if (!outcome.ok) return outcome;

    // Only a policy names an original to version; a tool retry keeps adding its output.
    const originalId =
      target.kind === "policy" ? (target.policy.fileId as FileId) : null;
    return {
      ok: true,
      produced: asFiles(outcome.files ?? [])
        .slice(0, 1)
        .map((file) => ({ file, originalId })),
    };
  },
  adoptFailed: (t) =>
    t(
      "notifications.adoptFailed",
      "The document was unlocked but could not be opened here. Try the tool directly.",
    ),
  notRerun: (t) =>
    t(
      "notifications.unlockedNotRerun",
      "The document was unlocked and opened here, but the policy could not be run on it again.",
    ),
  rerunUndelivered: (t) =>
    t(
      "notifications.unlockedRerunUndelivered",
      "The document was unlocked and the policy re-run started, but its result cannot be delivered here, so this failure stays open.",
    ),
};
