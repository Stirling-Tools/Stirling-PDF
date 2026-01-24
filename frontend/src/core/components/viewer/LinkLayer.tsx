import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { DEFAULT_DOCUMENT_ID } from '@app/components/viewer/viewerConstants';

enum PDFActionType {
  GoTo = 0,
  GoToR = 1,
  GoToE = 2,
  URI = 3,
  Launch = 4,
  Named = 5,
  JavaScript = 6,
}

type StrokeStyle = 'solid' | 'dashed' | 'beveled' | 'inset' | 'underline';

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
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  strokeDashArray?: number[];
  inReplyToId?: string;
  replyType?: 'Reply' | 'Group';
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
  const { provides: scroll } = useScroll(DEFAULT_DOCUMENT_ID);
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
      },
      computedBorderStyle: link.strokeStyle === 'dashed' || (link.strokeDashArray && link.strokeDashArray.length > 0)
        ? 'dashed'
        : link.strokeStyle === 'underline'
        ? 'none'
        : 'solid',
    }));
  }, [links, scale]);

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
          return;
        }
      } catch (error) {
        console.error('[LinkLayer] Failed to fetch links from annotation API:', {
          error,
          pageIndex,
        });
      }

      if (pdfDocument) {
        try {
          let pdfLinks: any[] = [];

          if (pdfDocument.getPageAnnotations && typeof pdfDocument.getPageAnnotations === 'function') {
            const result = pdfDocument.getPageAnnotations(pageIndex);
            const resolved = result && result.toPromise ? await result.toPromise() : await Promise.resolve(result);
            pdfLinks = Array.isArray(resolved) ? resolved : [];
          } else if (pdfDocument.getAnnotations && typeof pdfDocument.getAnnotations === 'function') {
            const result = pdfDocument.getAnnotations();
            const allAnnotations = result && result.toPromise ? await result.toPromise() : await Promise.resolve(result);
            const annotationsArray = Array.isArray(allAnnotations) ? allAnnotations : [];
            pdfLinks = annotationsArray.filter((ann: any) => ann.pageIndex === pageIndex && (ann.type === 2 || ann.type === PdfAnnotationSubtype.LINK));
          } else if (pdfDocument.pages && pdfDocument.pages[pageIndex]) {
            const page = pdfDocument.pages[pageIndex];
            if (page.getAnnotations && typeof page.getAnnotations === 'function') {
              const result = page.getAnnotations();
              const resolved = result && result.toPromise ? await result.toPromise() : await Promise.resolve(result);
              pdfLinks = Array.isArray(resolved) ? resolved : [];
            }
          }

          const convertedLinks = pdfLinks
            .filter((ann: any) => ann.type === 2 || ann.type === PdfAnnotationSubtype.LINK)
            .map((ann: any) => ({
              id: ann.id || `pdf-link-${pageIndex}-${Math.random().toString(36).substr(2, 9)}`,
              type: ann.type || 2,
              rect: ann.rect || ann,
              strokeColor: ann.strokeColor,
              strokeWidth: ann.strokeWidth,
              strokeStyle: ann.strokeStyle,
              strokeDashArray: ann.strokeDashArray,
              inReplyToId: ann.inReplyToId,
              replyType: ann.replyType,
              target: ann.target || ann.action || ann.dest
            })) as LinkAnnotation[];

          setLinks(convertedLinks);
        } catch (error) {
          console.warn('[LinkLayer] Failed to get annotations from PDF document:', error);
        }
      }
    };

    fetchLinks();
  }, [annotation, pageIndex, pdfDocument]);

  const handleLinkClick = useCallback(async (link: LinkAnnotation) => {
    if (isNavigating) return;

    try {
      setIsNavigating(true);

      if (onLinkClick) {
        onLinkClick(link.target);
        return;
      }

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
  }, [isNavigating, onLinkClick, scroll]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {processedLinks.map((link) => {
        const { id, strokeColor, strokeWidth, computedBorderStyle } = link;
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
              borderColor: strokeColor || '#60a5fa',
              borderWidth: strokeWidth ? `${strokeWidth}px` : '1px',
              borderStyle: computedBorderStyle || 'solid',
            }}
            title={getLinkTitle(link)}
            aria-label={getLinkAriaLabel(link)}
          />
        );
      })}
    </div>
  );
};
