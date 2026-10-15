import { useSyncExternalStore, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelectors } from "@app/contexts/FileContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useDropzoneFiles } from "@app/hooks/useDropzoneFiles";
import { alert } from "@app/components/toast";

// One drag state shared by every surface given these handlers (the workbench
// and the file sidebar), so the overlay the workbench draws stays up while the
// pointer moves from one to the other. Every child the pointer crosses fires its
// own enter/leave pair, so a depth count, not the last event, says whether the
// drag is still over any of them.
let dragDepth = 0;
let dragOver = false;
const listeners = new Set<() => void>();

function setDragDepth(depth: number) {
  dragDepth = Math.max(0, depth);
  const next = dragDepth > 0;
  if (next === dragOver) return;
  dragOver = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether files from outside the app are being dragged over any drop surface. */
export function useIsWorkbenchFileDragOver(): boolean {
  return useSyncExternalStore(subscribe, () => dragOver);
}

/**
 * Turns the element given `dropHandlers` into a target for files dragged in
 * from outside the app, adding them to the workbench. In-app drags (page and
 * file reorders) carry no "Files" type and pass straight through. While
 * `enabled` is false every handler is a no-op.
 */
export function useWorkbenchFileDrop(enabled: boolean) {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const getDropzoneFiles = useDropzoneFiles();
  const fileSelectors = useFileSelectors();

  // React bubbles events out of portals, so a drop on a modal's own dropzone
  // would otherwise reach here too; only the element's real subtree counts.
  const isExternalFileDrag = (e: DragEvent<HTMLElement>) =>
    enabled &&
    e.currentTarget.contains(e.target as Node) &&
    e.dataTransfer.types.includes("Files");

  const reportFailure = (cause: unknown, dropped: number, added: number) => {
    // ZIP extraction can add more files than were dropped, hence the floor.
    const failed = Math.max(1, dropped - added);
    alert({
      alertType: "error",
      title:
        dropped === 1
          ? t("workbench.dropFailedSingle", "Your file couldn't be added")
          : t(
              "workbench.dropFailedSome",
              "{{failed}} of your files couldn't be added",
              { failed },
            ),
      body: cause instanceof Error ? cause.message : undefined,
      expandable: false,
      durationMs: 5000,
    });
  };

  // WebKit (the macOS desktop webview) only keeps an element as the drop
  // target if dragenter is cancelled too; Chromium settles for dragover.
  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    setDragDepth(dragDepth + 1);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(e)) return;
    setDragDepth(dragDepth - 1);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = async (e: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    setDragDepth(0);
    const dropped = await getDropzoneFiles(e);
    const files = dropped.filter((item) => item instanceof File);
    if (files.length === 0) return;
    const openBefore = fileSelectors.getStirlingFileStubs().length;
    try {
      await addFiles(files);
    } catch (cause) {
      // addFiles dispatches in chunks, so a mid-batch failure leaves the
      // earlier files open.
      const added = fileSelectors.getStirlingFileStubs().length - openBefore;
      reportFailure(cause, files.length, added);
    }
  };

  return { onDragEnter, onDragLeave, onDragOver, onDrop };
}
