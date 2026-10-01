import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAllFiles, useFileSelection } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";

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
  /** Open a workbench file deliberately. */
  openFile: (file: File) => void;
  /** Record a document the editor loaded by other means, so auto-open stands down. */
  adopt: (file: File) => void;
}

/** The slice of the editor's state that decides whether it needs a file. */
export interface EditorLoadState {
  hasDocument: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Open the file the user most likely wants.
 *
 * Auto-opening only ever fires while the editor holds nothing: the selection
 * moves on its own (the Active Files view trims a multi-file selection down to
 * its last entry to honour the tool's one-file limit), and following it would
 * swap the open document, and any unsaved edits, out from under the user.
 *
 * "Holds nothing" is the store's own state, not a memory of having opened
 * something. The store is a module singleton that drops its document when the
 * canvas unmounts, while this hook's refs belong to the panel - so the two
 * disagree whenever one outlives the other, and a hook that stood down on its
 * own memory left the editor empty with no way back in.
 */
export function useAutoLoadFile(
  load: Loader,
  onFileChosen: OnFileChosen,
  currentFileId: FileId | null,
  /** Saving is swapping the workbench file under us; do not re-pick mid-swap. */
  hold: boolean,
  /** The editor's live state, so "is a document open" is asked, not remembered. */
  editor: EditorLoadState,
): AutoLoad {
  const navigationState = useNavigationState();
  const { selectedFiles } = useFileSelection();
  const { files: allFiles } = useAllFiles();
  const { activeFileId } = useViewer();

  const autoLoadFile = useMemo(() => {
    // Prefer the open document while it is still selected so a reordering
    // selection cannot nudge the editor onto a different file.
    if (currentFileId) {
      const held = selectedFiles.find(
        (f) => (f as WorkbenchFile).fileId === currentFileId,
      );
      if (held) return held;
    }
    if (selectedFiles[0]) return selectedFiles[0];
    if (activeFileId) {
      const viewerFile = allFiles.find(
        (f) => (f as WorkbenchFile).fileId === activeFileId,
      );
      if (viewerFile) return viewerFile;
    }
    if (allFiles.length === 1) return allFiles[0];
    return null;
  }, [selectedFiles, activeFileId, allFiles, currentFileId]);

  // The open document left the workbench, so the editor is free to pick again.
  const documentGone =
    currentFileId != null &&
    !allFiles.some((f) => (f as WorkbenchFile).fileId === currentFileId);

  const lastKeyRef = useRef<string | null>(null);
  const adopt = useCallback((file: File) => {
    lastKeyRef.current = fileKey(file);
  }, []);
  const openFile = useCallback(
    (file: File) => {
      adopt(file);
      onFileChosen(file.name, (file as WorkbenchFile).fileId);
      void load(file);
    },
    [adopt, load, onFileChosen],
  );

  useEffect(() => {
    if (!autoLoadFile || hold) return;
    if (navigationState.selectedTool !== "pdfTextEditor") return;
    // A document is open: leave it, and the user's unsaved edits, alone.
    if (editor.hasDocument && !documentGone) return;
    // An open is already in flight; landing it is what clears hasDocument.
    if (editor.loading) return;

    // Recovery: the store dropped a document this hook had already opened.
    // Re-open THAT file, and do it quietly - no pin, no filename change. The
    // canvas can be dropped because the user went to Active Files, and pinning
    // it back would yank them out of the list they just asked for.
    const recovering = lastKeyRef.current !== null;
    if (recovering) {
      const same = allFiles.find(
        (f) => (f as WorkbenchFile).fileId === currentFileId,
      );
      // Nothing to recover to: the file left the workbench, so fall through
      // and pick a candidate the normal way.
      if (same) {
        if (editor.error && lastKeyRef.current === fileKey(same)) return;
        adopt(same);
        void load(same);
        return;
      }
    }

    // This exact file already failed to open. Retrying it is a loop, not a fix.
    if (editor.error && lastKeyRef.current === fileKey(autoLoadFile)) return;
    openFile(autoLoadFile);
  }, [
    autoLoadFile,
    documentGone,
    editor.error,
    editor.hasDocument,
    editor.loading,
    hold,
    navigationState.selectedTool,
    openFile,
    adopt,
    allFiles,
    currentFileId,
    load,
  ]);

  return useMemo(() => ({ openFile, adopt }), [openFile, adopt]);
}
