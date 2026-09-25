import type {
  SaveResult,
  MultiFileSaveResult,
} from "@core/services/localFileSaveService";
import {
  saveToLocalPath,
  showSaveDialog,
} from "@desktop/services/localFileSaveService";

export type { SaveResult, MultiFileSaveResult };

/**
 * Writing to a picked location and asking for that location are both already
 * correct on a phone, so they are re-exported rather than copied:
 *
 * - `showSaveDialog` calls the dialog plugin's `save`, which IS implemented on
 *   mobile (`saveFileDialog`): Android runs `ACTION_CREATE_DOCUMENT` and hands
 *   back a `content://` URI, iOS presents the Files document picker and hands
 *   back a security-scoped `file://` URL. Cancelling resolves to `null` on both
 *   (Android rejects the native call, which the plugin folds into `None`), so
 *   the desktop cancel handling still holds. The extension filter it derives is
 *   mapped to MIME types on Android and ignored by the iOS save picker, so it
 *   is harmless either way.
 * - `saveToLocalPath` calls the fs plugin's `writeFile`, whose mobile
 *   `resolve_file` takes a URI-shaped path down a separate branch: Android
 *   resolves the content URI through the content resolver, iOS starts
 *   security-scoped access on the URL. So the string `showSaveDialog` returns
 *   can be passed straight through, exactly as on desktop.
 */
export { saveToLocalPath, showSaveDialog };

/**
 * Save several files, asking where each one goes.
 *
 * The desktop version picks one folder and writes every file into it. That is
 * not available here: the dialog plugin has no folder picker on mobile
 * (`open({ directory: true })` fails with `FolderPickerNotImplemented`), so the
 * only way to place a file outside the app sandbox is the document picker, one
 * file at a time. Cancelling stops the run and keeps whatever was already
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
