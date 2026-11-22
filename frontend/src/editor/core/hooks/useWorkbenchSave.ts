import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import { alert as showAlert } from "@editor/components/toast";
import {
  useAllFiles,
  useFileSelection,
  useFileSelectors,
} from "@editor/contexts/FileContext";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { ViewerContext, useViewer } from "@editor/contexts/ViewerContext";
import { useWorkbenchBar } from "@editor/contexts/WorkbenchBarContext";
import { useCommitEditsBeforeSave } from "@editor/hooks/useCommitEditsBeforeSave";
import {
  useSaveStoredFile,
  type SaveStoredFile,
} from "@editor/hooks/useSaveStoredFile";
import {
  downloadFile as downloadRaw,
  SAVES_TO_DISK,
} from "@editor/services/downloadService";
import { downloadFileWithPolicy } from "@editor/services/exportWithPolicy";
import { enforceExportPolicies } from "@editor/services/policyExport";
import {
  isStirlingFile,
  type StirlingFileStub,
} from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

async function enforcedViewerFile(
  buffer: ArrayBuffer,
  stub: StirlingFileStub,
): Promise<File> {
  const file = new File([buffer], stub.name, { type: "application/pdf" });
  const [enforced] = await enforceExportPolicies([file], [stub.id]);
  return enforced ?? file;
}

export interface WorkbenchSave {
  /** What Save acts on: the viewer's open file, every page editor track, else
   *  the selection, or every file when nothing is selected. */
  targetIds: string[];
  targetStubs: StirlingFileStub[];
  saver: SaveStoredFile;
  /** Commits the open editor's edits when the save goes home, then saves each
   *  target there. */
  save: () => Promise<void>;
  /** A copy of each target that leaves its home alone. */
  saveCopy: () => Promise<void>;
  /** The file as the viewer shows it, unapplied annotations included, with
   *  export policies run on it. Undefined outside the viewer. */
  viewerFileFor: (stub: StirlingFileStub) => Promise<File | undefined>;
}

/** The workbench's Save, shared by the toolbar and the keyboard shortcut so
 *  both act on the same files the same way. */
export function useWorkbenchSave(): WorkbenchSave {
  const { t } = useTranslation();
  const { workbench: currentView } = useNavigationState();
  const viewerContext = useContext(ViewerContext);
  const { activeFileId } = useViewer();
  const { viewFileActions } = useWorkbenchBar();
  const selectors = useFileSelectors();
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { files: activeFiles } = useAllFiles();
  const saver = useSaveStoredFile();

  const allFileIds = activeFiles.filter(isStirlingFile).map((f) => f.fileId);
  let targetIds: string[];
  if (currentView === "viewer") targetIds = activeFileId ? [activeFileId] : [];
  else if (currentView === "pageEditor" || selectedFileIds.length === 0)
    targetIds = allFileIds;
  else targetIds = selectedFileIds;
  const targetStubs = selectors.getStirlingFileStubs(targetIds as FileId[]);
  // A save to disk links the file to wherever it lands, so every one goes home.
  const savesHome =
    SAVES_TO_DISK ||
    targetStubs.some((stub) => saver.targetFor(stub) || stub.localFilePath);

  const handleExportAll = useCallback(
    async (forceNewFile = false) => {
      if (currentView === "viewer") {
        const fileToExport =
          activeFiles.find(
            (file) => isStirlingFile(file) && file.fileId === activeFileId,
          ) ?? activeFiles[0];
        if (!fileToExport) return;
        const stub = isStirlingFile(fileToExport)
          ? selectors.getStirlingFileStub(fileToExport.fileId)
          : undefined;
        // A save home has already committed the viewer's edits as a version, so
        // the stored file is what the viewer shows and needs no second export.
        if (stub && savesHome && !forceNewFile) {
          await saver.saveStoredFile(stub, selectors.getFile(stub.id));
          return;
        }
        const buffer = await viewerContext?.exportActions?.saveAsCopy?.();
        if (!buffer) return;
        if (stub) {
          const file = new File([buffer], stub.name, {
            type: "application/pdf",
          });
          const save = forceNewFile
            ? saver.saveLocalCopy
            : saver.saveStoredFile;
          await save(stub, file);
          return;
        }
        try {
          await downloadFileWithPolicy({
            data: new Blob([buffer], { type: "application/pdf" }),
            filename: fileToExport.name,
          });
        } catch (error) {
          console.error("[WorkbenchSave] Failed to export viewer file:", error);
        }
        return;
      }

      const viewExport = await viewFileActions?.getExportFiles?.({
        commitEdits: !forceNewFile && savesHome,
      });
      if (viewExport === null) return;
      let filesToExport: File[];
      let stubs: (StirlingFileStub | undefined)[];
      if (viewExport) {
        filesToExport = viewExport.map((entry) => entry.file);
        stubs = viewExport.map((entry) => {
          if (entry.stub) return entry.stub;
          return entry.fileId
            ? selectors.getStirlingFileStub(entry.fileId)
            : undefined;
        });
      } else {
        filesToExport = selectedFiles.length > 0 ? selectedFiles : activeFiles;
        stubs = filesToExport.map((file) =>
          isStirlingFile(file)
            ? selectors.getStirlingFileStub(file.fileId)
            : undefined,
        );
      }

      // Enforce all files in one batch so the toast shows progress across the
      // whole set (e.g. "report.pdf (2 of 5)") rather than N invisible solo runs.
      let enforced: File[];
      try {
        enforced = await enforceExportPolicies(
          filesToExport,
          stubs.map((s) => s?.id),
        );
      } catch (error) {
        // A required policy failed. Saving without it would skip what it exists
        // to enforce, so the save stops, as a single-file save does.
        showAlert({
          alertType: "error",
          title: t("fileEditor.saveFailed", "Save failed"),
          body: error instanceof Error ? error.message : String(error),
          privateBody: true,
          expandable: false,
        });
        return;
      }

      for (let idx = 0; idx < filesToExport.length; idx++) {
        const file = filesToExport[idx];
        const stub = stubs[idx];
        if (stub) {
          const save = forceNewFile
            ? saver.saveLocalCopy
            : saver.saveStoredFile;
          const outcome = await save(stub, enforced[idx], {
            policiesEnforced: true,
          });
          if (outcome === "cancelled") break;
          continue;
        }
        try {
          const result = await downloadRaw({
            data: enforced[idx],
            filename: file.name,
          });
          if (result.cancelled) break;
        } catch (error) {
          console.error(
            "[WorkbenchSave] Failed to export file:",
            file.name,
            error,
          );
        }
      }
    },
    [
      currentView,
      selectedFiles,
      activeFiles,
      activeFileId,
      viewerContext,
      viewFileActions,
      selectors,
      saver,
      savesHome,
      t,
    ],
  );

  const viewerFileFor = useCallback(
    async (stub: StirlingFileStub): Promise<File | undefined> => {
      if (currentView !== "viewer") return undefined;
      const buffer = await viewerContext?.exportActions?.saveAsCopy?.();
      return buffer ? enforcedViewerFile(buffer, stub) : undefined;
    },
    [currentView, viewerContext],
  );

  // A view with its own export commits its edits inside it.
  const save = useCommitEditsBeforeSave(() => handleExportAll(), {
    commitEdits: savesHome && !viewFileActions?.getExportFiles,
  });
  const saveCopy = useCallback(() => handleExportAll(true), [handleExportAll]);

  return { targetIds, targetStubs, saver, save, saveCopy, viewerFileFor };
}
