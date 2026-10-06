import { useEffect, useMemo } from "react";
import EmbedPdfViewer from "@app/components/viewer/EmbedPdfViewer";
import type { EmbedPdfViewerProps } from "@app/components/viewer/EmbedPdfViewer";
import {
  NonPdfViewerWrapper,
  type ViewerProps,
} from "@app/components/viewer/NonPdfViewer";
import { AttachmentSidebar } from "@app/components/viewer/AttachmentSidebar";
import { DocumentEditSessionProvider } from "@app/contexts/documentEdit/DocumentEditSessionContext";
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
  | "readOnlySignaturePreviews"
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

  // The session resets itself on a document swap through one DOCUMENT_REPLACED
  // transition. Deliberately not keyed: a keyed provider remounts its subtree,
  // tearing down the live viewer on an in-place save, which is exactly what the
  // in-place reload path exists to avoid.

  return (
    <DocumentEditSessionProvider documentId={activeFileId}>
      <div
        // Same geometry the portfolio branch already used: the in-place reload
        // specs assert page position and zoom across a swap, so this must not
        // gain a width the scroller did not have.
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          contain: "content",
        }}
      >
        {activeFile && !isPdfFile(activeFile) ? (
          <NonPdfViewerWrapper {...props} />
        ) : (
          <EmbedPdfViewer {...props} portfolioPinned={portfolio !== null} />
        )}

        {portfolio && (
          <AttachmentSidebar
            visible={isAttachmentSidebarVisible}
            thumbnailVisible={isThumbnailSidebarVisible}
            bookmarkVisible={isBookmarkSidebarVisible}
            portfolio={portfolio}
          />
        )}
      </div>
    </DocumentEditSessionProvider>
  );
};

export default Viewer;
