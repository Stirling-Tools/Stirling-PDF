import { useCallback } from "react";
import { EditorFileSwitcher } from "@app/tools/pdfTextEditor/components/EditorFileSwitcher";
import { useEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import {
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import type { FileId } from "@app/types/file";
import "@app/tools/pdfTextEditor/components/EditorTopBar.css";

/**
 * The document on screen and its switcher, standing in for the workbench's
 * view switcher in the viewer: the choices that matter there are which file
 * to look at, closing one, and getting to the list. While text editing, the
 * editor owns which file is open, so picking goes through it (and its guard
 * for unsaved edits); otherwise picking just shows that file.
 */
export default function EditorDocSwitcher() {
  const session = useEditorSession();
  const { files } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const { activeFileId, setActiveFileId } = useViewer();
  const { requestNavigation } = useNavigationGuard();
  const { actions: navigation } = useNavigationActions();

  const closeFile = useCallback(
    (file: File) => {
      const fileId = (file as File & { fileId?: FileId }).fileId;
      if (fileId == null) return;
      const remove = async () => {
        const remaining = files.filter(
          (f) => (f as File & { fileId?: FileId }).fileId !== fileId,
        );
        // Show the next file before removing, so the viewer never lands on
        // a document that is no longer there.
        const next = remaining[0] as (File & { fileId?: FileId }) | undefined;
        if (fileId === activeFileId && next?.fileId) {
          setActiveFileId(next.fileId);
        }
        await fileActions.removeFiles([fileId], false);
        if (remaining.length === 0) navigation.setWorkbench("fileEditor");
      };
      // Closing the document being edited throws its unsaved edits away, so
      // that goes through the same guard as leaving the editor.
      if (fileId === session?.fileId && session.dirty) {
        requestNavigation(() => void remove());
      } else {
        void remove();
      }
    },
    [
      files,
      activeFileId,
      setActiveFileId,
      fileActions,
      navigation,
      requestNavigation,
      session,
    ],
  );

  // The file on screen, which the editor also edits; the viewer shows the
  // first file until one is picked.
  const shown = (files.find(
    (f) => (f as File & { fileId?: FileId }).fileId === activeFileId,
  ) ?? files[0]) as (File & { fileId?: FileId }) | undefined;
  if (!shown) return null;
  const editing = session?.fileName ? session : null;
  return (
    <EditorFileSwitcher
      currentFileId={shown.fileId ?? null}
      currentFileName={shown.name}
      dirty={Boolean(editing?.dirty && editing.fileId === shown.fileId)}
      onPick={(file) => {
        if (editing) {
          // The editor guards its unsaved edits, then shows what it opens.
          editing.pickFile(file);
          return;
        }
        const fileId = (file as File & { fileId?: FileId }).fileId;
        if (fileId) setActiveFileId(fileId);
      }}
      onClose={closeFile}
      onViewActiveFiles={() => navigation.setWorkbench("fileEditor")}
    />
  );
}
