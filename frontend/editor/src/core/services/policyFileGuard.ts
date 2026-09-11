import i18n from "@app/i18n";
import { isFileBlocked } from "@app/services/policyBlockRegistry";

/** A required-policy failure prevents the requested file operation. */
export class PolicyBlockedError extends Error {
  constructor() {
    super(i18n.t("policy.blockedBody"));
    this.name = "PolicyBlockedError";
  }
}

/** Checks current policy outcomes; call again after preparing bytes asynchronously. */
export function assertFilesNotBlocked(fileIds: Iterable<string>): void {
  for (const fileId of fileIds) {
    if (isFileBlocked(fileId)) throw new PolicyBlockedError();
  }
}
