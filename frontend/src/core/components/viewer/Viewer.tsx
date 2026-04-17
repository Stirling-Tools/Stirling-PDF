import { useMemo } from "react";
import EmbedPdfViewer from "@app/components/viewer/EmbedPdfViewer";
import {
  NonPdfViewerWrapper,
  type ViewerProps,
} from "@app/components/viewer/NonPdfViewer";
import { useFileState } from "@app/contexts/FileContext";
import { isPdfFile } from "@app/utils/fileUtils";

export type { ViewerProps };

const Viewer = (props: ViewerProps) => {
  const { selectors } = useFileState();
  const activeFiles = selectors.getFiles();
  const activeFileIndex = props.activeFileIndex ?? 0;

  // Determine the active file — previewFile takes priority
  const activeFile = useMemo(() => {
    if (props.previewFile) return props.previewFile;
    return activeFiles[activeFileIndex] ?? activeFiles[0] ?? null;
  }, [props.previewFile, activeFiles, activeFileIndex]);

  // Route to the appropriate viewer based on file type
  if (activeFile && !isPdfFile(activeFile)) {
    return <NonPdfViewerWrapper {...props} />;
  }

  return <EmbedPdfViewer {...props} />;
};

export default Viewer;
