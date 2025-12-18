import React from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import type { StirlingFileStub } from "@app/types/fileContext";
import { detectFileExtension } from "@app/utils/fileUtils";

type FileLike = File | StirlingFileStub;

/**
 * Returns an appropriate file type icon for the provided file.
 * - Uses the real file type and extension to decide the icon.
 * - No any-casts; accepts File or StirlingFileStub.
 */
export function getFileTypeIcon(file: FileLike, size: number | string = "2rem"): React.ReactElement {
  const name = (file?.name ?? "").toLowerCase();
  const mime = (file?.type ?? "").toLowerCase();
  const ext = detectFileExtension(name);

  // JavaScript
  if (ext === "js" || mime.includes("javascript")) {
    return <LocalIcon icon="javascript-rounded" width={size} height={size} style={{ color: "var(--mantine-color-gray-6)" }} />;
  }

  // PDF
  if (ext === "pdf" || mime === "application/pdf") {
    return <LocalIcon icon="picture-as-pdf-rounded" width={size} height={size} style={{ color: "var(--mantine-color-gray-6)" }} />;
  }

  // Fallback generic
  return <LocalIcon icon="article-rounded" width={size} height={size} style={{ color: "var(--mantine-color-gray-6)" }} />;
}
