import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';

enum PDFActionType {
  GoTo = 0,
  GoToR = 1,
  GoToE = 2,
  URI = 3,
  // Add other types as needed
}

interface PDFRect {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

interface PDFDestination {
  pageIndex: number;
  view: [number, number];
}

interface PDFAction {
  type: string | number;
  destination?: PDFDestination;
  uri?: string;
}

interface LinkAnnotation {
  id: string;
  type: number;
  rect: PDFRect;
  target?: {
    type: string;
    action?: PDFAction;
    destination?: PDFDestination;
    uri?: string;
  };
}

function isGoToAction(action: PDFAction): boolean {
  return action.type === 'GoTo' || action.type === PDFActionType.GoTo;
}

function isURIAction(action: PDFAction): boolean {
  return action.type === 'URI' || action.type === PDFActionType.URI;
}

function isInternalLink(link: LinkAnnotation): boolean {
  return Boolean(link.target?.type === 'destination' ||
         (link.target?.type === 'action' && link.target.action && isGoToAction(link.target.action)));
}

function isExternalLink(link: LinkAnnotation): boolean {
  return Boolean(link.target?.type === 'uri' ||
         (link.target?.type === 'action' && link.target.action && isURIAction(link.target.action)));
}

interface LinkLayerProps {
  pageIndex: number;
  scale: number;
  document?: any;
  pdfFile?: File | Blob;
  onLinkClick?: (target: any) => void;
}

const getLinkTitle = (link: LinkAnnotation): string => {
  if (link.target?.type === 'destination') {
    return `Go to page ${(link.target.destination?.pageIndex ?? 0) + 1}`;
  }
  if (link.target?.type === 'action' && link.target.action?.type === 'GoTo') {
    return `Go to page ${(link.target.action.destination?.pageIndex ?? 0) + 1}`;
  }
  if (link.target?.type === 'action' && (link.target.action?.type === 'URI' || link.target.action?.type === 3)) {
    return `Open link: ${link.target.action.uri}`;
  }
  if (link.target?.uri) {
    return `Open link: ${link.target.uri}`;
  }
  return 'Link';
};

const getLinkAriaLabel = (link: LinkAnnotation): string => {
  if (link.target?.type === 'destination') {
    return `Navigate to page ${(link.target.destination?.pageIndex ?? 0) + 1}`;
  }
  if (link.target?.type === 'action' && link.target.action?.type === 'GoTo') {
    return `Navigate to page ${(link.target.action.destination?.pageIndex ?? 0) + 1}`;
  }
  if (link.target?.type === 'action' && (link.target.action?.type === 'URI' || link.target.action?.type === 3)) {
    return 'Open external link';
  }
  return 'Open external link';
};

export const LinkLayer: React.FC<LinkLayerProps> = ({
  pageIndex,
  scale,
  document: pdfDocument,
  onLinkClick
}) => {
  const { provides: annotation } = useAnnotationCapability();
  const { provides: scroll } = useScroll();
  const [links, setLinks] = useState<LinkAnnotation[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);

  const processedLinks = useMemo(() => {
    return links.map(link => ({
      ...link,
      scaledRect: {
        left: link.rect.origin.x * scale,
        top: link.rect.origin.y * scale,
        width: link.rect.size.width * scale,
        height: link.rect.size.height * scale,
      }
    }));
  }, [links, scale]);

  useEffect(() => {
    const fetchLinks = async () => {
      if (!annotation) return;

      try {
        // Use the annotation API's built-in filtering if available
        const pageAnnotations = await annotation
          .getPageAnnotations({
            pageIndex,
            // Try to filter for link annotations (type 2) if the API supports it
            ...(annotation.getPageAnnotations.length > 1 ? { types: [2] } : {})
          })
          .toPromise();

        // Filter for link annotations (type 2 is LINK in PDF spec) as fallback
        const linkAnnotations = pageAnnotations.filter(
          (ann: any) => ann.type === 2
        ) as LinkAnnotation[];

        if (linkAnnotations.length > 0) {
          setLinks(linkAnnotations);
          return;
        }
      } catch (error) {
        console.error('[LinkLayer] Failed to fetch links from annotation API:', error);
      }

      if (pdfDocument) {
        try {
          // Try different methods to get link annotations
          let pdfLinks: any[] = [];

          if (pdfDocument.getPageAnnotations && typeof pdfDocument.getPageAnnotations === 'function') {
            pdfLinks = await pdfDocument.getPageAnnotations(pageIndex);
          } else if (pdfDocument.getAnnotations && typeof pdfDocument.getAnnotations === 'function') {
            const allAnnotations = await pdfDocument.getAnnotations();
            pdfLinks = allAnnotations.filter((ann: any) => ann.pageIndex === pageIndex && ann.type === 2);
          } else if (pdfDocument.pages && pdfDocument.pages[pageIndex]) {
            const page = pdfDocument.pages[pageIndex];
            if (page.getAnnotations && typeof page.getAnnotations === 'function') {
              pdfLinks = await page.getAnnotations();
            }
          }

          const convertedLinks = pdfLinks.map((ann: any) => ({
            id: ann.id || `pdf-link-${pageIndex}-${Math.random()}`,
            type: ann.type || 2,
            rect: ann.rect || ann,
            target: ann.target || ann.action
          })) as LinkAnnotation[];

          setLinks(convertedLinks);
        } catch (error) {
          console.warn('[LinkLayer] Failed to get annotations from PDF document:', error);
        }
      } else {
        console.warn('[LinkLayer] No annotation API or PDF document available');
      }
    };

    fetchLinks();
  }, [annotation, pageIndex, pdfDocument]);

  const handleLinkClick = useCallback(async (link: LinkAnnotation) => {
    if (isNavigating) return; // Prevent multiple simultaneous navigations

    try {
      setIsNavigating(true);

      if (onLinkClick) {
        onLinkClick(link.target);
        return;
      }

      if (isInternalLink(link)) {
        const targetPage = link.target?.destination?.pageIndex ??
                          link.target?.action?.destination?.pageIndex;
        if (targetPage !== undefined && scroll) {
          await scroll.scrollToPage({
            pageNumber: targetPage + 1, // PDF pages are 1-indexed
            behavior: 'smooth',
          });
        }
      } else if (isExternalLink(link)) {
        const uri = link.target?.uri ?? link.target?.action?.uri;
        if (uri) {
          window.open(uri, '_blank', 'noopener,noreferrer');
        }
      } else {
        throw new Error(`Unsupported link type: ${link.target?.type}`);
      }
    } catch (error) {
      console.error('[LinkLayer] Navigation failed:', error);
    } finally {
      setIsNavigating(false);
    }
  }, [isNavigating, onLinkClick, scroll]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {processedLinks.map((link) => {
        const { id } = link;
        const { left, top, width, height } = link.scaledRect;

        return (
          <button
            key={id}
            onClick={() => handleLinkClick(link)}
            disabled={isNavigating}
            className={`absolute opacity-0 hover:opacity-20 bg-blue-500 transition-opacity cursor-pointer pointer-events-auto border border-blue-400 hover:border-blue-600 ${isNavigating ? 'cursor-not-allowed opacity-50' : ''}`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
              minWidth: '8px',
              minHeight: '8px',
            }}
            title={getLinkTitle(link)}
            aria-label={getLinkAriaLabel(link)}
          />
        );
      })}
    </div>
  );
};
