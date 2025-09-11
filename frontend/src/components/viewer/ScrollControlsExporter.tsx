import { useEffect } from 'react';
import { useScroll } from '@embedpdf/plugin-scroll/react';

/**
 * Component that runs inside EmbedPDF context and exports scroll controls globally
 */
export function ScrollControlsExporter() {
  const { provides: scroll, state: scrollState } = useScroll();

  useEffect(() => {
    if (scroll && scrollState) {
      // Export scroll controls to global window for toolbar access
      (window as any).embedPdfScroll = {
        scrollToPage: (page: number) => scroll.scrollToPage({ pageNumber: page }),
        scrollToNextPage: () => scroll.scrollToNextPage(),
        scrollToPreviousPage: () => scroll.scrollToPreviousPage(),
        scrollToFirstPage: () => scroll.scrollToPage({ pageNumber: 1 }),
        scrollToLastPage: () => scroll.scrollToPage({ pageNumber: scrollState.totalPages }),
        currentPage: scrollState.currentPage,
        totalPages: scrollState.totalPages,
      };
      
    }
  }, [scroll, scrollState]);

  return null; // This component doesn't render anything
}