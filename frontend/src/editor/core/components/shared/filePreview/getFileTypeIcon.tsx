import React from "react";
import { FileDocIcon } from "@app/components/shared/FileDocIcon";
import type { FileDocVariant } from "@app/components/shared/FileDocIcon";
import type { StirlingFileStub } from "@app/types/fileContext";
import { detectFileExtension } from "@app/utils/fileUtils";

export const SPREADSHEET_EXTS = new Set(["csv", "xls", "xlsx", "ods"]);
export const DOC_EXTS = new Set([
  "md",
  "markdown",
  "txt",
  "doc",
  "docx",
  "odt",
  "rtf",
]);
export const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tiff",
  "tif",
]);
export const ARCHIVE_EXTS = new Set([
  "zip",
  "tar",
  "gz",
  "rar",
  "7z",
  "cbz",
  "cbr",
]);
export const CODE_EXTS = new Set([
  "js",
  "ts",
  "jsx",
  "tsx",
  "html",
  "css",
  "json",
  "xml",
  "yaml",
  "yml",
]);

type FileLike = File | StirlingFileStub;

export function getFileDocVariant(ext: string, mime = ""): FileDocVariant {
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (
    SPREADSHEET_EXTS.has(ext) ||
    mime.includes("spreadsheet") ||
    mime === "text/csv"
  )
    return "spreadsheet";
  if (
    DOC_EXTS.has(ext) ||
    mime === "text/markdown" ||
    mime === "text/plain" ||
    mime.includes("word") ||
    mime.includes("opendocument.text")
  )
    return "doc";
  if (IMAGE_EXTS.has(ext) || mime.startsWith("image/")) return "image";
  if (ARCHIVE_EXTS.has(ext) || mime.includes("zip") || mime.includes("archive"))
    return "archive";
  if (
    CODE_EXTS.has(ext) ||
    mime.includes("javascript") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime === "text/html"
  )
    return "code";
  return "generic";
}

export function getFileTypeIcon(
  file: FileLike,
  size: number | string = "2rem",
): React.ReactElement {
  const name = (file?.name ?? "").toLowerCase();
  const mime = (file?.type ?? "").toLowerCase();
  const ext = detectFileExtension(name);
  return (
    <FileDocIcon
      variant={getFileDocVariant(ext, mime)}
      style={{ width: size, height: "auto" }}
    />
  );
}
