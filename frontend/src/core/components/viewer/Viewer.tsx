import { useMemo } from "react";
import EmbedPdfViewer from "@app/components/viewer/EmbedPdfViewer";
import {
  NonPdfViewerWrapper,
  type ViewerProps,
} from "@app/components/viewer/NonPdfViewer";
import { useFileState } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { isStirlingFile } from "@app/types/fileContext";
import { isPdfFile } from "@app/utils/fileUtils";

export type { ViewerProps };

const Viewer = (props: ViewerProps) => {
  const { selectors } = useFileState();
  const activeFiles = selectors.getFiles();
  const { activeFileId } = useViewer();

  // Determine the active file — previewFile takes priority, then look up by stable ID
  const activeFile = useMemo(() => {
    if (props.previewFile) return props.previewFile;
    const byId = activeFileId ? activeFiles.find((f) => isStirlingFile(f) && f.fileId === activeFileId) : null;
    return byId ?? activeFiles[0] ?? null;
  }, [props.previewFile, activeFiles, activeFileId]);

  // Route to the appropriate viewer based on file type
  if (activeFile && !isPdfFile(activeFile)) {
    return <NonPdfViewerWrapper {...props} />;
  }

  return <EmbedPdfViewer {...props} />;
};

export default Viewer;
