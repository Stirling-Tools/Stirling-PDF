import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { PdfAnnotationSubtype } from '@embedpdf/models';

enum PDFActionType {
  GoTo = 0,
  GoToR = 1,
  GoToE = 2,
  URI = 3,
  Launch = 4,
  Named = 5,
  JavaScript = 6,
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
  documentId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}

export const LinkLayer: React.FC<LinkLayerProps> = ({
  documentId,
  pageIndex,
  pageWidth,
  pageHeight,
}) => {
  const { provides: annotation } = useAnnotationCapability();
  const { provides: scroll } = useScroll(documentId);
  const documentState = useDocumentState(documentId);
  const [links, setLinks] = useState<LinkAnnotation[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);

  // Get original PDF page dimensions from document state
  const pdfPage = documentState?.document?.pages?.[pageIndex];
  const pdfPageWidth = pdfPage?.size?.width ?? 0;
  const pdfPageHeight = pdfPage?.size?.height ?? 0;

  // Process links with proper coordinate transformation
  const processedLinks = useMemo(() => {
    if (!pageWidth || !pageHeight || !pdfPageWidth || !pdfPageHeight) return [];
    
    // Calculate scale factor from PDF coordinates to rendered coordinates
    const scaleX = pageWidth / pdfPageWidth;
    const scaleY = pageHeight / pdfPageHeight;
    
    return links.map(link => {
      const { origin, size } = link.rect;
      
      // EmbedPDF returns coordinates already in top-left origin (CSS-compatible)
      // Just need to scale from PDF units to rendered pixels
      const scaledLeft = origin.x * scaleX;
      const scaledTop = origin.y * scaleY;
      const scaledWidth = size.width * scaleX;
      const scaledHeight = size.height * scaleY;
      
      return {
        ...link,
        scaledRect: {
          left: scaledLeft,
          top: scaledTop,
          width: scaledWidth,
          height: scaledHeight,
        },
      };
    });
  }, [links, pageWidth, pageHeight, pdfPageWidth, pdfPageHeight]);

  useEffect(() => {
    const fetchLinks = async () => {
      if (!annotation) return;

      try {
        const pageAnnotationsResult = annotation.getPageAnnotations({
          pageIndex,
        });

        const resolveAnnotations = async (result: unknown): Promise<any[]> => {
          if (result && typeof (result as any).toPromise === 'function') {
            return (result as any).toPromise();
          }
          if (result && typeof (result as any).then === 'function') {
            return result as Promise<any[]>;
          }
          if (Array.isArray(result)) {
            return result;
          }
          return [];
        };

        const pageAnnotations = await resolveAnnotations(pageAnnotationsResult);

        const linkAnnotations = pageAnnotations.filter(
          (ann: any) => ann.type === 2 || ann.type === PdfAnnotationSubtype.LINK
        ) as LinkAnnotation[];

        if (linkAnnotations.length > 0) {
          setLinks(linkAnnotations);
        }
      } catch (error) {
        console.error('[LinkLayer] Failed to fetch links from annotation API:', {
          error,
          pageIndex,
        });
      }
    };

    fetchLinks();
  }, [annotation, pageIndex]);

  const handleLinkClick = useCallback(async (link: LinkAnnotation) => {
    if (isNavigating) return;

    try {
      setIsNavigating(true);

      if (isInternalLink(link)) {
        const targetPage = link.target?.destination?.pageIndex ??
                          link.target?.action?.destination?.pageIndex ??
                          (link.target as any)?.dest?.pageIndex;
        
        if (targetPage !== undefined && scroll) {
          scroll.scrollToPage({
            pageNumber: targetPage + 1,
            behavior: 'smooth',
          });
        }
      } else if (isExternalLink(link)) {
        const uri = link.target?.uri ?? 
                    link.target?.action?.uri ??
                    (link.target as any)?.url;
        
        if (uri) {
          try {
            const url = new URL(uri, window.location.href);
            if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
              window.open(uri, '_blank', 'noopener,noreferrer');
            } else {
              console.warn('[LinkLayer] Blocked potentially unsafe URL protocol:', url.protocol);
            }
          } catch {
            window.open(uri, '_blank', 'noopener,noreferrer');
          }
        }
      } else {
        console.warn(`[LinkLayer] Unsupported link type: ${link.target?.type}`);
      }
    } catch (error) {
      console.error('[LinkLayer] Navigation failed:', error);
    } finally {
      setIsNavigating(false);
    }
  }, [isNavigating, scroll]);

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
            className={`absolute opacity-0 hover:opacity-20 bg-blue-500 transition-opacity cursor-pointer pointer-events-auto ${isNavigating ? 'cursor-not-allowed opacity-50' : ''}`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
              minWidth: '8px',
              minHeight: '8px',
              border: '1px solid transparent',
            }}
            title={getLinkTitle(link)}
            aria-label={getLinkAriaLabel(link)}
          />
        );
      })}
    </div>
  );
};

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
