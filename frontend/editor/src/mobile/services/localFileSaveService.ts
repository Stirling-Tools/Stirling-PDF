import type {
  SaveResult,
  MultiFileSaveResult,
} from "@core/services/localFileSaveService";
import i18n from "@app/i18n";
import { assertFilesNotBlocked } from "@app/services/policyFileGuard";

export type { SaveResult, MultiFileSaveResult };

/**
 * Write `data` to a location the save picker just returned.
 *
 * `filePath` is the picker's URI, not a filesystem path: the fs plugin's mobile
 * `resolve_file` resolves an Android `content://` URI through the content
 * resolver and starts security-scoped access on an iOS `file://` URL, so it is
 * passed straight through.
 */
export async function saveToLocalPath(
  data: Blob | File,
  filePath: string,
): Promise<SaveResult> {
  try {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const arrayBuffer = await data.arrayBuffer();
    assertFilesNotBlocked();
    await writeFile(filePath, new Uint8Array(arrayBuffer));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LocalFileSave] Failed to save:", message);
    return { success: false, error: message };
  }
}

/**
 * Ask where to save `defaultFilename`; `null` when the user cancels.
 *
 * Android runs `ACTION_CREATE_DOCUMENT` and iOS presents the Files document
 * picker. Cancelling resolves to `null` on both (Android rejects the native
 * call, which the plugin folds into `None`). The extension filter is mapped to
 * MIME types on Android and ignored by the iOS save picker. `defaultDirectory`
 * is accepted for signature parity and ignored: neither picker can be opened
 * at a path.
 */
export async function showSaveDialog(
  defaultFilename: string,
  _defaultDirectory?: string,
): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const ext = defaultFilename.split(".").pop()?.toLowerCase() ?? "";
    const filters = ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [];
    return await save({
      defaultPath: defaultFilename,
      filters,
      title: i18n.t("workbenchBar.saveAs", "Save As"),
    });
  } catch (error) {
    console.error("[SaveDialog] Failed to show dialog:", error);
    return null;
  }
}

/**
 * Save several files, asking where each one goes.
 *
 * The dialog plugin has no folder picker on mobile (`open({ directory: true })`
 * fails with `FolderPickerNotImplemented`), so the only way to place a file
 * outside the app sandbox is the document picker, one file at a time. Cancelling stops the run and keeps whatever was already
 * written, rather than reopening the picker for every remaining file.
 */
export async function saveMultipleFilesWithPrompt(
  files: (Blob | File)[],
  _defaultDirectory?: string,
): Promise<MultiFileSaveResult> {
  const errors: string[] = [];
  let savedCount = 0;

  for (const [index, file] of files.entries()) {
    const name = file instanceof File ? file.name : `output_${index + 1}.pdf`;

    const targetPath = await showSaveDialog(name);
    if (!targetPath) {
      return { success: false, savedCount, cancelledByUser: true };
    }

    const result = await saveToLocalPath(file, targetPath);
    if (result.success) {
      savedCount += 1;
    } else {
      errors.push(`${name}: ${result.error ?? "unknown error"}`);
    }
  }

  if (savedCount === files.length) {
    return { success: true, savedCount };
  }

  return {
    success: false,
    savedCount,
    error: `Saved ${savedCount}/${files.length} files. Errors: ${errors.join(", ")}`,
  };
}
