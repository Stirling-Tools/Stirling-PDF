import type { ReactNode } from "react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";

interface ViewerZoomGesturesProps {
  documentId: string;
  children: ReactNode;
}

/** Page zoom is locked in the mobile app, so pinching zooms the document itself. */
export function ViewerZoomGestures({
  documentId,
  children,
}: ViewerZoomGesturesProps) {
  return (
    <ZoomGestureWrapper documentId={documentId} enableWheel={false}>
      {children}
    </ZoomGestureWrapper>
  );
}
