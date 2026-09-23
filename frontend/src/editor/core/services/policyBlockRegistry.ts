import type { StirlingFileStub } from "@app/types/fileContext";

/** Register documents retained outside the workspace until their owning tool releases them. */
export function registerPolicyFileUsage(
  _files: StirlingFileStub[],
): () => void {
  return () => {};
}

/** Whether a required policy currently prevents use of this document. */
export function isFileBlocked(_fileId: string): boolean {
  return false;
}

/** Whether the open editor is waiting for policy recovery. */
export function isEditorPolicyBlocked(): boolean {
  return false;
}

/** Includes consumed ancestors so an edit cannot bypass a failure on its input. */
export function policySourceIds(
  file: Pick<StirlingFileStub, "id" | "parentFileId" | "sourceFileIds">,
): string[] {
  return [
    file.id,
    ...(file.sourceFileIds ?? []),
    ...(file.parentFileId ? [file.parentFileId] : []),
  ];
}
