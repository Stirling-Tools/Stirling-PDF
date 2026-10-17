import type { ReactNode } from "react";

interface ViewerZoomGesturesProps {
  documentId: string;
  children: ReactNode;
}

/**
 * Wraps the viewer's page scroller to give it zoom gestures. The default adds
 * none: in a browser, pinching zooms the page and the viewer zooms with it.
 */
export function ViewerZoomGestures({ children }: ViewerZoomGesturesProps) {
  return <>{children}</>;
}
