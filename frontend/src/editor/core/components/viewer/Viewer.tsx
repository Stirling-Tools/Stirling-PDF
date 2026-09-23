import { useEffect, useMemo } from "react";
import EmbedPdfViewer from "@app/components/viewer/EmbedPdfViewer";
import type { EmbedPdfViewerProps } from "@app/components/viewer/EmbedPdfViewer";
import {
  NonPdfViewerWrapper,
  type ViewerProps,
} from "@app/components/viewer/NonPdfViewer";
import { AttachmentSidebar } from "@app/components/viewer/AttachmentSidebar";
import { usePortfolioSession } from "@app/components/viewer/hooks/usePortfolioSession";
import { useAllFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { isStirlingFile } from "@app/types/fileContext";
import { isPdfFile } from "@app/utils/fileUtils";

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
  const { files: activeFiles } = useAllFiles();
  const {
    activeFileId,
    isAttachmentSidebarVisible,
    toggleAttachmentSidebar,
    isThumbnailSidebarVisible,
    isBookmarkSidebarVisible,
  } = useViewer();

  // Determine the active file — previewFile takes priority, then look up by stable ID
  const activeFile = useMemo(() => {
    if (props.previewFile) return props.previewFile;
    const byId = activeFileId
      ? activeFiles.find((f) => isStirlingFile(f) && f.fileId === activeFileId)
      : null;
    return byId ?? activeFiles[0] ?? null;
  }, [props.previewFile, activeFiles, activeFileId]);

  // A portfolio stays pinned while its members are read, so the panel below
  // outlives the viewer swap that opening a non-PDF member causes.
  const { session, activeMemberName } = usePortfolioSession(
    activeFile instanceof File ? activeFile : null,
  );

  useEffect(() => {
    if (session && !isAttachmentSidebarVisible && !activeMemberName) {
      toggleAttachmentSidebar();
    }
    // Keyed on the portfolio alone: opening a member must not reopen a panel the
    // reader has closed, and switching portfolios should offer it again.
  }, [session?.file]);

  const portfolio = useMemo(
    () => (session ? { ...session, activeMemberName } : null),
    [session, activeMemberName],
  );

  const viewer =
    activeFile && !isPdfFile(activeFile) ? (
      <NonPdfViewerWrapper {...props} />
    ) : (
      <EmbedPdfViewer {...props} portfolioPinned={portfolio !== null} />
    );

  if (!portfolio) return viewer;

  // The panel is fixed-positioned against its nearest contained ancestor, which
  // inside the PDF viewer is that viewer's own root. Above both viewers it needs
  // an equivalent, or it anchors to the window and covers the tool rail.
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        contain: "content",
      }}
    >
      {viewer}
      <AttachmentSidebar
        visible={isAttachmentSidebarVisible}
        thumbnailVisible={isThumbnailSidebarVisible}
        bookmarkVisible={isBookmarkSidebarVisible}
        portfolio={portfolio}
      />
    </div>
  );
};

export default Viewer;
