import i18n from "i18next";
import {
  isEditorPolicyBlocked,
  isFileBlocked,
} from "@app/services/policyBlockRegistry";
export { policySourceIds } from "@app/services/policyBlockRegistry";

/** A required policy prevents using or exporting the document. */
export class PolicyBlockedError extends Error {
  constructor() {
    super(i18n.t("policy.recoveryBody"));
    this.name = "PolicyBlockedError";
  }
}

/** Recheck after asynchronous preparation, immediately before using the resulting bytes. */
export function assertFilesNotBlocked(
  fileIds: Iterable<string | undefined> = [],
): void {
  if (isEditorPolicyBlocked()) throw new PolicyBlockedError();
  for (const fileId of fileIds) {
    if (fileId && isFileBlocked(fileId)) throw new PolicyBlockedError();
  }
}
