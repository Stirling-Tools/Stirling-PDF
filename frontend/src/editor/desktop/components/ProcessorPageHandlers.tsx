import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { message } from "@tauri-apps/plugin-dialog";
import { EDITOR_BASENAME } from "@editor/routes/editorBasename";
import { isPortalPath } from "@editor/routes/portalBasename";
import { fileOpenService } from "@editor/services/fileOpenService";
import { fileStorage } from "@editor/services/fileStorage";
import {
  originalIdOf,
  readWorkbenchSession,
} from "@editor/services/workbenchSession";
import type { StirlingFileStub } from "@editor/types/fileContext";

/** Open files with edits not yet saved, read from storage since the editor is not mounted. */
export async function unsavedWorkbenchFiles(): Promise<StirlingFileStub[]> {
  const open = new Set(readWorkbenchSession()?.fileIds ?? []);
  if (open.size === 0) return [];
  const stubs = await fileStorage.getLeafStirlingFileStubs().catch(() => []);
  return stubs.filter((stub) => open.has(originalIdOf(stub)) && stub.isDirty);
}

/** Files opened from the OS land in the editor, which takes them off the queue as it mounts. */
function useOpenedFilesGoToEditor(onProcessor: boolean) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!onProcessor) return;
    let disposed = false;
    const check = async () => {
      if ((await fileOpenService.hasOpenedFiles()) && !disposed) {
        navigate(EDITOR_BASENAME);
      }
    };
    void check();
    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow()
      .listen("files-changed", () => void check())
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onProcessor, navigate]);
}

/** The editor's unsaved-changes warning, for a window closed from a Processor page. */
function useExitWarningOnProcessor(onProcessor: boolean) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!onProcessor) return;
    const appWindow = getCurrentWindow();
    let closing = false;
    const unlisten = appWindow.onCloseRequested(async (event) => {
      if (closing) return;
      const unsaved = await unsavedWorkbenchFiles();
      if (unsaved.length === 0) {
        closing = true;
        return;
      }
      event.preventDefault();

      const openLabel = t("confirmCloseOpenEditor", "Open in the editor");
      const discardLabel = t(
        "confirmCloseDiscard",
        "Discard changes and close",
      );
      const choice = await message(
        t(
          "confirmCloseUnsavedList",
          "You have {{count}} file(s) with unsaved changes.\n\n{{fileList}}",
          {
            count: unsaved.length,
            fileList: unsaved.map((stub) => `• ${stub.name}`).join("\n"),
          },
        ),
        {
          title: t("confirmCloseUnsaved", "This file has unsaved changes."),
          kind: "warning",
          buttons: {
            yes: openLabel,
            no: discardLabel,
            cancel: t("confirmCloseCancel", "Cancel"),
          },
        },
      );
      if (choice === openLabel) {
        navigate(EDITOR_BASENAME);
      } else if (choice === discardLabel) {
        closing = true;
        await appWindow.destroy().catch((error: unknown) => {
          console.error("[exit-warning] destroy failed", error);
          closing = false;
        });
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [onProcessor, navigate, t]);
}

/**
 * What the editor handles on its own pages, kept working on the Processor's,
 * where the editor is not mounted.
 */
export function ProcessorPageHandlers() {
  const onProcessor = isPortalPath(useLocation().pathname);
  useOpenedFilesGoToEditor(onProcessor);
  useExitWarningOnProcessor(onProcessor);
  return null;
}
