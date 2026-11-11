import type { StirlingFileStub } from "@editor/types/fileContext";
import type { PolicyState } from "@editor/types/policies";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import { toolIOFor } from "@editor/types/toolIO";
import { toolAcceptsFile, toolAcceptsFormat } from "@editor/utils/toolIOCompat";

type PolicyInputFile = Pick<
  StirlingFileStub,
  "name" | "type" | "processedFile"
> & { id?: string };

function isPasswordProtected(file: PolicyInputFile): boolean {
  const access = getPdfAccess(file.id);
  return access
    ? access.encrypted && !access.rightsManaged
    : Boolean(file.processedFile?.isEncrypted);
}

/** Automatic enforcement requires a known first step that accepts the current file. */
export function policyAcceptsFile(
  policy: Pick<PolicyState, "firstOperation"> | undefined,
  file: PolicyInputFile,
): boolean {
  const operation = policy?.firstOperation;
  if (!operation || !toolIOFor(operation)) return false;
  return isPasswordProtected(file)
    ? toolAcceptsFormat(operation, "PDF_ENCRYPTED")
    : toolAcceptsFile(operation, file);
}
