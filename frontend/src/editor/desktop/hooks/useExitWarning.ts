import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { useFileSelectors } from "@editor/contexts/FileContext";
import { useSaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import type { StirlingFileStub } from "@editor/types/fileContext";
import { useTranslation } from "react-i18next";

/**
 * Files to offer saving before the window closes. A file whose disk original
 * was deleted has lost its link, so it no longer counts as unsaved against a
 * home, but its edits exist nowhere else.
 */
export function filesToSaveOnQuit(
  stubs: StirlingFileStub[],
  isUnsaved: (stub: StirlingFileStub) => boolean,
): StirlingFileStub[] {
  return stubs.filter((stub) => stub.isDirty || isUnsaved(stub));
}

export function useExitWarning() {
  const { t } = useTranslation();
  const selectors = useFileSelectors();
  const saver = useSaveStoredFile();
  const selectorsRef = useRef(selectors);
  const saverRef = useRef(saver);
  const isClosingRef = useRef(false);

  selectorsRef.current = selectors;
  saverRef.current = saver;

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const handleCloseRequested = async (event: {
      preventDefault: () => void;
    }) => {
      if (isClosingRef.current) {
        return;
      }

      const dirtyStubs = filesToSaveOnQuit(
        selectorsRef.current.getStirlingFileStubs(),
        saverRef.current.isUnsaved,
      );

      // Nothing unsaved: don't preventDefault, so the window closes natively
      // without depending on the JS dialog/destroy round-trip below.
      if (dirtyStubs.length === 0) {
        isClosingRef.current = true;
        return;
      }

      event.preventDefault();

      if (dirtyStubs.length > 0) {
        const fileList = dirtyStubs.map((f) => `• ${f.name}`).join("\n");
        const saveLabel = t("confirmCloseSave", "Save and close");
        const discardLabel = t(
          "confirmCloseDiscard",
          "Discard changes and close",
        );
        const cancelLabel = t("confirmCloseCancel", "Cancel");

        const choice = await message(
          t(
            "confirmCloseUnsavedList",
            "You have {{count}} file(s) with unsaved changes.\n\n{{fileList}}",
            {
              count: dirtyStubs.length,
              fileList,
            },
          ),
          {
            title: t("confirmCloseUnsaved", "This file has unsaved changes."),
            kind: "warning",
            buttons: {
              yes: saveLabel,
              no: discardLabel,
              cancel: cancelLabel,
            },
          },
        );

        if (choice === cancelLabel) {
          return;
        }

        if (choice === saveLabel) {
          const { failedCount, cancelled } = await saveDirtyFiles(dirtyStubs);
          if (cancelled) {
            return;
          }
          if (failedCount > 0) {
            await message(
              t(
                "confirmCloseSaveFailed",
                "Saved with errors. {{count}} file(s) could not be saved.",
                {
                  count: failedCount,
                },
              ),
              {
                title: t("confirmCloseSaveFailedTitle", "Save Failed"),
                kind: "error",
              },
            );
            return;
          }
        } else if (choice !== discardLabel) {
          return;
        }
      }

      isClosingRef.current = true;
      try {
        await appWindow.destroy();
      } catch (error) {
        console.error("[exit-warning] destroy failed", error);
        isClosingRef.current = false;
      }
    };

    const unlisten = appWindow.onCloseRequested(handleCloseRequested);
    return () => {
      unlisten.then((fn) => {
        fn();
      });
    };
  }, [t]);

  const saveDirtyFiles = async (dirtyStubs: StirlingFileStub[]) => {
    let failedCount = 0;
    let cancelled = false;
    for (const stub of dirtyStubs) {
      const file = selectorsRef.current.getFile(stub.id);
      const outcome = await saverRef.current.saveStoredFile(stub, file);
      if (outcome === "cancelled") {
        cancelled = true;
        break;
      }
      if (outcome === "failed") failedCount += 1;
    }
    return { failedCount, cancelled };
  };
}
