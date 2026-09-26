import type {
  FileWithPath,
  FileDialogOptions,
} from "@core/services/fileDialogService";
import { createQuickKey } from "@app/types/fileContext";
import { getDocumentFileDialogFilter } from "@app/utils/fileDialogUtils";
import i18n from "@app/i18n";
import { alert } from "@app/components/toast";

export type { FileWithPath, FileDialogOptions };

/** Whether cancelling the picker should finish instead of opening a browser fallback. */
export const hasNativeFileDialog = true;

const FALLBACK_NAME = "document";

/** Leading bytes to MIME type, for the formats this app accepts. */
const MAGIC_NUMBERS: Array<{ bytes: number[]; type: string; ext: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], type: "application/pdf", ext: "pdf" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], type: "image/png", ext: "png" },
  { bytes: [0xff, 0xd8, 0xff], type: "image/jpeg", ext: "jpg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], type: "image/gif", ext: "gif" },
  { bytes: [0x42, 0x4d], type: "image/bmp", ext: "bmp" },
  { bytes: [0x49, 0x49, 0x2a, 0x00], type: "image/tiff", ext: "tiff" },
  { bytes: [0x4d, 0x4d, 0x00, 0x2a], type: "image/tiff", ext: "tiff" },
  // PK\x03\x04 also covers the OOXML formats, which are zip containers.
  { bytes: [0x50, 0x4b, 0x03, 0x04], type: "application/zip", ext: "zip" },
];

/** HTML has no fixed signature, so it is recognised from its leading markup. */
const HTML_FORMAT = { type: "text/html", ext: "html" };
const HTML_PREFIX = /^(?:\uFEFF)?\s*(?:<!doctype html|<html[\s>])/i;

function sniffFormat(data: Uint8Array) {
  const binary = MAGIC_NUMBERS.find((candidate) =>
    candidate.bytes.every((byte, index) => data[index] === byte),
  );
  if (binary) return binary;
  const head = new TextDecoder().decode(data.subarray(0, 512));
  return HTML_PREFIX.test(head) ? HTML_FORMAT : undefined;
}

/**
 * Turn what the picker returned into something usable as a file name.
 *
 * Neither mobile picker returns a path. Android returns a `content://` URI
 * whose last segment is a provider id (`.../document/msf%3A1000000123`), and
 * iOS returns a percent-encoded security-scoped `file://` URL. So the desktop
 * trick of splitting on separators only sometimes lands on a real name.
 */
function deriveFileName(uri: string): string | null {
  let candidate = uri.split("#")[0].split("?")[0];
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // Leave the raw string alone if it is not valid percent-encoding.
  }

  const segment = (candidate.split(/[/\\:]/).pop() ?? "").trim();
  // Only trust the segment when it ends in something extension-shaped;
  // a bare provider id would otherwise become the document's name.
  return /\.[A-Za-z0-9]{1,8}$/.test(segment) ? segment : null;
}

/**
 * Open the native picker and read what was selected.
 *
 * The picker itself behaves like desktop's (the dialog plugin implements
 * `showFilePicker` on both platforms, and the extension filters are mapped to
 * MIME types on Android and to UTTypes on iOS). What differs is the result:
 * it identifies the file by URI rather than by path, so the name and type are
 * recovered here instead of being read off a path.
 */
export async function openFileDialog(
  options?: FileDialogOptions,
): Promise<FileWithPath[]> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");

    const selected = await open({
      multiple: options?.multiple ?? true,
      filters: options?.filters ?? getDocumentFileDialogFilter(),
    });

    if (!selected) return [];

    const uris = Array.isArray(selected) ? selected : [selected];
    const filesWithPaths: FileWithPath[] = [];
    let failedCount = 0;

    for (const uri of uris) {
      try {
        const data = await readFile(uri);
        const format = sniffFormat(data);
        const name =
          deriveFileName(uri) ??
          (format ? `${FALLBACK_NAME}.${format.ext}` : FALLBACK_NAME);

        const file = new File([data], name, { type: format?.type ?? "" });

        filesWithPaths.push({
          file,
          path: uri,
          quickKey: createQuickKey(file),
        });
      } catch (error) {
        failedCount += 1;
        console.error("[FileDialog] Failed to read selection:", error);
      }
    }

    // An empty result means "cancelled" to the caller, so a selection that
    // could not be read has to surface as an error rather than as nothing.
    if (filesWithPaths.length === 0) {
      throw new Error(
        i18n.t(
          "mobile.files.readFailed",
          "The selected files could not be opened.",
        ),
      );
    }
    if (failedCount > 0) {
      alert({
        alertType: "warning",
        title: i18n.t(
          "mobile.files.someUnreadable",
          "Some files could not be opened",
        ),
        isPersistentPopup: false,
      });
    }

    return filesWithPaths;
  } catch (error) {
    console.error("[FileDialog] Error:", error);
    throw error;
  }
}
