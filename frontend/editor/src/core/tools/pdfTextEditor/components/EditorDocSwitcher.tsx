import { EditorFileSwitcher } from "@app/tools/pdfTextEditor/components/EditorFileSwitcher";
import { useEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import { useAllFiles } from "@app/contexts/FileContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useCloseViewerFile } from "@app/components/viewer/useCloseViewerFile";
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
  const { files, fileStubs } = useAllFiles();
  const { activeFileId, setActiveFileId } = useViewer();
  const { actions: navigation } = useNavigationActions();

  const closeViewerFile = useCloseViewerFile();
  const closeFile = (file: File) => {
    const fileId = (file as File & { fileId?: FileId }).fileId;
    if (fileId != null) closeViewerFile(fileId);
  };

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
      currentFileName={
        fileStubs.find((s) => s.id === shown.fileId)?.name ?? shown.name
      }
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
