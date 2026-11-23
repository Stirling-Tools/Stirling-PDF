import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAllFiles, useFileSelection } from "@editor/contexts/FileContext";
import type { FileId } from "@editor/types/file";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";

type Loader = (file: File) => unknown;
// The workbench fileId is what lets save write the edit back to the
// same file rather than only producing a download.
type OnFileChosen = (name: string, fileId?: FileId) => void;

type WorkbenchFile = File & { fileId?: FileId; quickKey?: string };

function fileKey(file: File): string {
  const f = file as WorkbenchFile;
  return f.fileId ?? f.quickKey ?? `${f.name}|${f.size}|${f.lastModified}`;
}

interface AutoLoad {
  /** Record a document the editor loaded by other means, so it is not opened again. */
  adopt: (file: File) => void;
  /** Keep a cancelled password request closed until another file or an explicit open. */
  cancel: (file: File) => void;
  /** The file the user moved to while the open document has unsaved edits. */
  pendingSwitch: File | null;
  /** Drop the unsaved edits and open the pending file. */
  confirmSwitch: () => void;
  /** Keep editing the open document and move the active file back to it. */
  cancelSwitch: () => void;
}

/** The slice of the editor's state that decides whether it needs a file. */
export interface EditorLoadState {
  hasDocument: boolean;
  loading: boolean;
  error: string | null;
  dirty: boolean;
  passwordPrompt?: { fileName: string; retry: boolean } | null;
}

/**
 * Keep the editor on the workbench's active file, the one the viewer shows.
 *
 * Only the active file is followed, never the selection: the selection moves on
 * its own (the Active Files view trims a multi-file selection down to its last
 * entry), and following it would swap the document out from under the user.
 * The selection is read only for the first pick, while no file is active.
 *
 * "Is a document open" is the store's own state, not a memory of having opened
 * something: the store is a module singleton that can drop its document while
 * this hook's refs live on, and a hook that trusted its own memory left the
 * editor empty with no way back in.
 */
export function useAutoLoadFile(
  load: Loader,
  onFileChosen: OnFileChosen,
  currentFileId: FileId | null,
  /** Saving is swapping the workbench file under us; do not re-pick mid-swap. */
  hold: boolean,
  editor: EditorLoadState,
): AutoLoad {
  const navigationState = useNavigationState();
  const { selectedFiles } = useFileSelection();
  const { files: allFiles } = useAllFiles();
  const { activeFileId, setActiveFileId } = useViewer();

  const activeFile = useMemo(
    () =>
      (activeFileId &&
        allFiles.find((f) => (f as WorkbenchFile).fileId === activeFileId)) ||
      null,
    [activeFileId, allFiles],
  );
  const firstPick =
    selectedFiles[0] ?? (allFiles.length === 1 ? allFiles[0] : null);
  const target = activeFile ?? (editor.hasDocument ? null : firstPick);

  // The open document left the workbench, so its edits have nowhere to go.
  const documentGone =
    currentFileId != null &&
    !allFiles.some((f) => (f as WorkbenchFile).fileId === currentFileId);

  const [pendingSwitch, setPendingSwitch] = useState<File | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const cancelledKeyRef = useRef<string | null>(null);
  const cancel = useCallback((file: File) => {
    cancelledKeyRef.current = fileKey(file);
  }, []);
  const adopt = useCallback((file: File) => {
    cancelledKeyRef.current = null;
    lastKeyRef.current = fileKey(file);
  }, []);
  const open = useCallback(
    (file: File) => {
      adopt(file);
      onFileChosen(file.name, (file as WorkbenchFile).fileId);
      void load(file);
    },
    [adopt, load, onFileChosen],
  );

  useEffect(() => {
    if (!target || hold) return;
    if (navigationState.selectedTool !== "pdfTextEditor") return;
    const key = fileKey(target);
    if (cancelledKeyRef.current === key) return;
    cancelledKeyRef.current = null;
    // Restarting a pending open would reset its password prompt.
    if (editor.loading || editor.passwordPrompt) return;

    // The open document's own file, met again by a hook that remounted.
    if (
      editor.hasDocument &&
      currentFileId != null &&
      (target as WorkbenchFile).fileId === currentFileId
    ) {
      lastKeyRef.current = key;
    }
    if (lastKeyRef.current === key) {
      if (editor.hasDocument) {
        setPendingSwitch(null);
        return;
      }
      // This exact file already failed to open. Retrying it is a loop, not a fix.
      if (editor.error) return;
      // The store dropped the document this hook opened: reopen it quietly.
      void load(target);
      return;
    }
    if (editor.hasDocument && editor.dirty && !documentGone) {
      setPendingSwitch(target);
      return;
    }
    setPendingSwitch(null);
    open(target);
  }, [
    target,
    hold,
    navigationState.selectedTool,
    editor.loading,
    editor.passwordPrompt,
    editor.hasDocument,
    editor.error,
    editor.dirty,
    documentGone,
    load,
    open,
  ]);

  const confirmSwitch = useCallback(() => {
    if (pendingSwitch) open(pendingSwitch);
    setPendingSwitch(null);
  }, [open, pendingSwitch]);

  const cancelSwitch = useCallback(() => {
    if (pendingSwitch) cancelledKeyRef.current = fileKey(pendingSwitch);
    setPendingSwitch(null);
    if (currentFileId) setActiveFileId(currentFileId);
  }, [currentFileId, pendingSwitch, setActiveFileId]);

  return useMemo(
    () => ({ adopt, cancel, pendingSwitch, confirmSwitch, cancelSwitch }),
    [adopt, cancel, pendingSwitch, confirmSwitch, cancelSwitch],
  );
}
