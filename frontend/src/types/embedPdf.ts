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
}

export interface EmbedPdfSpreadAPI {
  toggleSpreadMode: () => void;
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
    embedPdfThumbnail?: EmbedPdfThumbnailAPI;
    toggleThumbnailSidebar?: () => void;
  }
}