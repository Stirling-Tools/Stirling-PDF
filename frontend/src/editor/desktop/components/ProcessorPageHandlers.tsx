import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { message } from "@tauri-apps/plugin-dialog";
import { useAuth } from "@editor/auth/UseSession";
import { EDITOR_BASENAME } from "@editor/routes/editorBasename";
import { isPortalPath } from "@editor/routes/portalBasename";
import { fileOpenService } from "@editor/services/fileOpenService";
import { fileStorage } from "@editor/services/fileStorage";
import { hasUnsavedCloudChanges } from "@editor/services/oneDriveSave";
import { filesToSaveOnQuit } from "@editor/hooks/useExitWarning";
import {
  fingerprintOwner,
  originalIdOf,
  readWorkbenchSession,
} from "@editor/services/workbenchSession";
import type { StirlingFileStub } from "@editor/types/fileContext";

/**
 * Open files with edits not yet saved, read from storage since the editor is
 * not mounted: unsaved to disk, or to the cloud drive a file came from. A
 * workbench another account left behind counts as none, as the editor discards
 * it. Null when storage could not be read, which must not pass for "none".
 */
export async function unsavedWorkbenchFiles(
  userId: string | null,
): Promise<StirlingFileStub[] | null> {
  const session = readWorkbenchSession();
  const open = new Set(session?.fileIds ?? []);
  if (!session || open.size === 0) return [];
  const owner = userId == null ? null : await fingerprintOwner(userId);
  if ((session.userId ?? null) !== owner) return [];
  let stubs: StirlingFileStub[];
  try {
    stubs = await fileStorage.getLeafStirlingFileStubs();
  } catch {
    return null;
  }
  return filesToSaveOnQuit(
    stubs.filter((stub) => open.has(originalIdOf(stub))),
    hasUnsavedCloudChanges,
  );
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
    // Listening before the first look, so a file queued in between still signals.
    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow()
      .listen("files-changed", () => void check())
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) void check();
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
  const { user } = useAuth();
  const userId = useRef<string | null>(null);
  userId.current = user?.id != null ? String(user.id) : null;

  useEffect(() => {
    if (!onProcessor) return;
    const appWindow = getCurrentWindow();
    let closing = false;
    const unlisten = appWindow.onCloseRequested(async (event) => {
      if (closing) return;
      const unsaved = await unsavedWorkbenchFiles(userId.current);
      if (unsaved?.length === 0) {
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
        unsaved === null
          ? t(
              "confirmCloseCheckFailed",
              "Stirling PDF could not check your open files for unsaved changes.",
            )
          : t(
              "confirmCloseUnsavedList",
              "You have {{count}} file(s) with unsaved changes.\n\n{{fileList}}",
              {
                count: unsaved.length,
                fileList: unsaved.map((stub) => `• ${stub.name}`).join("\n"),
              },
            ),
        {
          title:
            unsaved === null
              ? t("confirmClose", "Confirm Close")
              : t("confirmCloseUnsaved", "This file has unsaved changes."),
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
