import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelectors } from "@app/contexts/FileContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useDropzoneFiles } from "@app/hooks/useDropzoneFiles";
import { alert } from "@app/components/toast";

/**
 * Turns the element given `dropHandlers` into a target for files dragged in
 * from outside the app. In-app drags (page and file reorders) carry no
 * "Files" type and pass straight through. While `enabled` is false every
 * handler is a no-op and `isFileDragOver` stays false.
 */
export function useWorkbenchFileDrop(enabled: boolean) {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const getDropzoneFiles = useDropzoneFiles();
  const fileSelectors = useFileSelectors();
  // Every child the pointer crosses fires its own enter/leave pair, so a
  // depth count, not the last event, says whether the drag is still inside.
  const dragDepth = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const isExternalFileDrag = (e: DragEvent<HTMLElement>) =>
    enabled && e.dataTransfer.types.includes("Files");

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
    dragDepth.current += 1;
    setIsDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = async (e: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
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

  return {
    isFileDragOver: enabled && isDragOver,
    dropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
