import {
  getFormFillFileId,
  isStirlingFile,
  type StirlingFile,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * The workbench file the form panel fills, commits and saves.
 *
 * That is the document whose fields are loaded (`fieldsFileKey`, the context's `forFileId`):
 * the viewer applies the result to the file it shows, so filling any other file would save
 * that file's pages as a new version of the shown one. The selection only decides while no
 * fields are loaded.
 */
export function formFillTarget(
  files: StirlingFile[],
  fieldsFileKey: string | null,
  selectedFileIds: FileId[],
): StirlingFile | null {
  if (files.length === 0) return null;
  if (fieldsFileKey) {
    const shown = files.find(
      (file) => getFormFillFileId(file) === fieldsFileKey,
    );
    if (shown) return shown;
  }
  if (selectedFileIds.length > 0) {
    const selected = files.find(
      (file) => isStirlingFile(file) && selectedFileIds.includes(file.fileId),
    );
    if (selected) return selected;
  }
  return files[0];
}
