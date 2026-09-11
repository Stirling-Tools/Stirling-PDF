import { isStirlingFile } from "@app/types/fileContext";

/** Resolves workspace IDs from either the input bytes or FormFill's prefixed source identity. */
export function formPolicySourceIds(
  file: File | Blob | null,
  formFileId?: string | null,
): string[] {
  return [
    ...new Set([
      ...(file && isStirlingFile(file) ? [file.fileId] : []),
      ...(formFileId?.startsWith("stirling-")
        ? [formFileId.slice("stirling-".length)]
        : []),
    ]),
  ];
}
