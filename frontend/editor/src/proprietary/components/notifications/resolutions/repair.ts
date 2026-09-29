import {
  repairDocuments,
  retryInputIds,
  retryWithFiles,
} from "@app/services/notificationRetry";
import type { FileId } from "@app/types/file";
import {
  asFile,
  type Resolution,
} from "@app/components/notifications/resolutions/resolution";

export const repair: Resolution = {
  actionId: "REPAIR",
  toolId: "repair",
  needsPassword: false,
  async produce(target, context) {
    // Every input the re-run will send, so a merge cannot fail again on an unrepaired sibling.
    const originalIds =
      target.kind === "tool"
        ? retryInputIds(target.payload, context.notification.fileId)
        : [target.policy.fileId];

    const outcome = await repairDocuments(originalIds);
    if (!outcome.ok) return outcome;

    // Paired to its original: a policy row versions that in place, while a tool row only feeds
    // these into the re-run and keeps the output.
    return {
      ok: true,
      produced: (outcome.repaired ?? []).map((document) => ({
        file: asFile(document.file),
        originalId: document.fileId as FileId,
      })),
    };
  },
  toolRerun: {
    run: (payload, files) => retryWithFiles(payload, files),
    notAdopted: (t) =>
      t(
        "notifications.repairedRerunNotAdopted",
        "The repaired document went through, but its result could not be opened here.",
      ),
  },
  adoptFailed: (t) =>
    t(
      "notifications.repairAdoptFailed",
      "The document was repaired but could not be opened here. Try the Repair tool directly.",
    ),
  notRerun: (t) =>
    t(
      "notifications.repairedNotRerun",
      "The document was repaired and opened here, but the policy could not be run on it again.",
    ),
  rerunUndelivered: (t) =>
    t(
      "notifications.repairedRerunUndelivered",
      "The document was repaired and the policy re-run started, but its result cannot be delivered here, so this failure stays open.",
    ),
};
