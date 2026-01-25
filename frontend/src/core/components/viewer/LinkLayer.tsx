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

// Utility functions for link type detection - prefixed to indicate future use
function _isInternalLink(link: LinkAnnotation): boolean {
  return Boolean(link.target?.type === 'destination' ||
         (link.target?.type === 'action' && link.target.action && isGoToAction(link.target.action)));
}

function _isExternalLink(link: LinkAnnotation): boolean {
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
    
    // Use the document scale like EmbedPDF's AnnotationLayer does
    const scale = documentState?.scale ?? 1;
    

    
    return links.map(link => {
      const { origin, size } = link.rect;
      
      // Use document scale like EmbedPDF does
      const scaledLeft = origin.x * scale;
      const scaledTop = origin.y * scale;
      const scaledWidth = size.width * scale;
      const scaledHeight = size.height * scale;
      
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
  }, [links, pageWidth, pageHeight, pdfPageWidth, pdfPageHeight, documentState?.scale, pageIndex]);

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

      // Try to extract destination from various possible locations in the link object
      const linkData = link as any;
      
      // Check for destination in various locations
      let targetPage: number | undefined;
      let uri: string | undefined;
      
      // Try target.destination first
      if (link.target?.destination?.pageIndex !== undefined) {
        targetPage = link.target.destination.pageIndex;
      }
      // Try target.action.destination
      else if (link.target?.action?.destination?.pageIndex !== undefined) {
        targetPage = link.target.action.destination.pageIndex;
      }
      // Try direct dest property (PDF.js style)
      else if (linkData.dest?.pageIndex !== undefined) {
        targetPage = linkData.dest.pageIndex;
      }
      // Try destination at root level
      else if (linkData.destination?.pageIndex !== undefined) {
        targetPage = linkData.destination.pageIndex;
      }
      // Try action at root level
      else if (linkData.action?.destination?.pageIndex !== undefined) {
        targetPage = linkData.action.destination.pageIndex;
      }
      
      // Check for URI in various locations
      if (link.target?.uri) {
        uri = link.target.uri;
      } else if (link.target?.action?.uri) {
        uri = link.target.action.uri;
      } else if (linkData.uri) {
        uri = linkData.uri;
      } else if (linkData.url) {
        uri = linkData.url;
      } else if (linkData.action?.uri) {
        uri = linkData.action.uri;
      }

      if (targetPage !== undefined && scroll) {
        scroll.scrollToPage({
          pageNumber: targetPage + 1,
          behavior: 'smooth',
        });
      } else if (uri) {
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
      } else {
        console.warn('[LinkLayer] Could not extract destination or URI from link:', link);
      }
    } catch (error) {
      console.error('[LinkLayer] Navigation failed:', error);
    } finally {
      setIsNavigating(false);
    }
  }, [isNavigating, scroll]);

  return (
    <div 
      className="absolute inset-0" 
      style={{ 
        pointerEvents: 'none',
        zIndex: 10, // Above selection layer but below UI controls
      }}
    >
      {processedLinks.map((link) => {
        const { id } = link;
        const { left, top, width, height } = link.scaledRect;

        return (
          <a
            key={id}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleLinkClick(link);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`absolute block cursor-pointer ${isNavigating ? 'cursor-not-allowed' : ''}`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
              minWidth: '8px',
              minHeight: '8px',
              pointerEvents: 'auto',
              backgroundColor: 'transparent',
              zIndex: 11,
              border: '2px solid transparent',
              borderRadius: '2px',
              transition: 'background-color 0.15s ease-in-out, border-color 0.15s ease-in-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
            title={getLinkTitle(link)}
            aria-label={getLinkAriaLabel(link)}
          >
            {/* Invisible clickable area */}
          </a>
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
