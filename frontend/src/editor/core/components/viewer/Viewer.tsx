import { useMemo } from "react";
import EmbedPdfViewer from "@editor/components/viewer/EmbedPdfViewer";
import type { EmbedPdfViewerProps } from "@editor/components/viewer/EmbedPdfViewer";
import {
  NonPdfViewerWrapper,
  type ViewerProps,
} from "@editor/components/viewer/NonPdfViewer";
import { useFileState } from "@editor/contexts/FileContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { isStirlingFile } from "@editor/types/fileContext";
import { isPdfFile } from "@editor/utils/fileUtils";

export type { ViewerProps };

// Signature-overlay props live on EmbedPdfViewerProps; Viewer passes them through
// so callers can drive the overlay. They don't apply to the non-PDF viewer.
type SignatureOverlayPassThrough = Pick<
  EmbedPdfViewerProps,
  | "signaturePreviews"
  | "signaturePreviewsReadOnly"
  | "signaturePlacementMode"
  | "signaturePlacementData"
  | "signaturePlacementType"
  | "onSignaturePreviewsChange"
  | "signatureOverlayApiRef"
>;

const Viewer = (props: ViewerProps & SignatureOverlayPassThrough) => {
  const { selectors } = useFileState();
  const activeFiles = selectors.getFiles();
  const { activeFileId } = useViewer();

  // Determine the active file — previewFile takes priority, then look up by stable ID
  const activeFile = useMemo(() => {
    if (props.previewFile) return props.previewFile;
    const byId = activeFileId
      ? activeFiles.find((f) => isStirlingFile(f) && f.fileId === activeFileId)
      : null;
    return byId ?? activeFiles[0] ?? null;
  }, [props.previewFile, activeFiles, activeFileId]);

  // Route to the appropriate viewer based on file type
  if (activeFile && !isPdfFile(activeFile)) {
    return <NonPdfViewerWrapper {...props} />;
  }

  return <EmbedPdfViewer {...props} />;
};

export default Viewer;
