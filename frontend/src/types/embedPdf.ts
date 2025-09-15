// Types for EmbedPDF global APIs
export interface EmbedPdfZoomAPI {
  zoomPercent: number;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface EmbedPdfScrollAPI {
  currentPage: number;
  totalPages: number;
  scrollToPage: (page: number) => void;
  scrollToFirstPage: () => void;
  scrollToPreviousPage: () => void;
  scrollToNextPage: () => void;
  scrollToLastPage: () => void;
}

export interface EmbedPdfPanAPI {
  isPanning: boolean;
  togglePan: () => void;
}

export interface EmbedPdfSpreadAPI {
  toggleSpreadMode: () => void;
}

export interface EmbedPdfRotateAPI {
  rotateForward: () => void;
  rotateBackward: () => void;
  setRotation: (rotation: number) => void;
  getRotation: () => number;
}

export interface EmbedPdfControlsAPI {
  pointer: () => void;
}

export interface EmbedPdfThumbnailAPI {
  thumbnailAPI: {
    renderThumb: (pageIndex: number, scale: number) => {
      toPromise: () => Promise<Blob>;
    };
  };
}

declare global {
  interface Window {
    embedPdfZoom?: EmbedPdfZoomAPI;
    embedPdfScroll?: EmbedPdfScrollAPI;
    embedPdfPan?: EmbedPdfPanAPI;
    embedPdfSpread?: EmbedPdfSpreadAPI;
    embedPdfRotate?: EmbedPdfRotateAPI;
    embedPdfControls?: EmbedPdfControlsAPI;
    embedPdfThumbnail?: EmbedPdfThumbnailAPI;
    toggleThumbnailSidebar?: () => void;
  }
}