import { useEffect } from "react";

/**
 * True when a drag/drop event carries operating-system files (an external
 * file drag) rather than internal HTML5 drag-and-drop payloads such as page
 * or file-tile reordering, which use custom data types instead of "Files".
 */
export function isExternalFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) {
    return false;
  }
  return Array.from(types).includes("Files");
}

/**
 * Attach window-level guards that stop a stray external file drop from
 * navigating the document to the dropped file.
 *
 * Intended dropzones (e.g. the Mantine Dropzone in FileManager) still receive
 * and process their own drop events - their element-level handlers run first
 * during bubbling and read `dataTransfer.files` there. This guard only cancels
 * the leftover browser/webview default action (navigating to the file) for
 * file drops that no dropzone handled, so it never interferes with dropzone
 * uploads or with internal, non-file drag-and-drop.
 *
 * Returns a disposer that removes the listeners.
 */
export function installFileDropGuard(target: Window = window): () => void {
  const onDragOver = (event: DragEvent): void => {
    if (isExternalFileDrag(event)) {
      event.preventDefault();
    }
  };
  const onDrop = (event: DragEvent): void => {
    if (isExternalFileDrag(event)) {
      event.preventDefault();
    }
  };

  target.addEventListener("dragover", onDragOver);
  target.addEventListener("drop", onDrop);

  return () => {
    target.removeEventListener("dragover", onDragOver);
    target.removeEventListener("drop", onDrop);
  };
}

/**
 * Prevents an accidental file drop outside a dropzone from replacing the app
 * with a full-screen view of the dropped file, which in the desktop webview
 * leaves the window unusable. See issue #6872.
 */
export function useGlobalFileDropGuard(): void {
  useEffect(() => installFileDropGuard(window), []);
}
