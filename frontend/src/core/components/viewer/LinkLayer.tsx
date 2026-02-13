import React, { useCallback, useState, useMemo, useRef } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { usePdfLibLinks, type PdfLibLink } from '@app/hooks/usePdfLibLinks';

// ---------------------------------------------------------------------------
// Inline SVG icons (thin-stroke, modern)
// ---------------------------------------------------------------------------

const TrashIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 4h8M5.5 4v-1a0.5 0 0 1 0.5-0.5h2a0.5 0 0 1 0.5 0.5v1M4.5 4l0.4 7a0.8 0 0 0 0.8 0.7h2.6a0.8 0 0 0 0.8-0.7l0.4-7"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ExternalLinkIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8.5 3.5l-3.5 3.5m3.5-3.5v2.5m0-2.5h-2.5M3.5 3.5h-0.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-0.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PageIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 2.5h3l2 2v4.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 2.5v2h2"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateUrl(url: string, maxLen = 32): string {
  try {
    const u = new URL(url);
    const display = u.hostname + (u.pathname !== '/' ? u.pathname : '');
    return display.length > maxLen ? display.slice(0, maxLen) + '\u2026' : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '\u2026' : url;
  }
}

function getLinkLabel(link: PdfLibLink): string {
  if (link.type === 'internal' && link.targetPage !== undefined) {
    return `Page ${link.targetPage + 1}`;
  }
  if (link.type === 'external' && link.uri) {
    return truncateUrl(link.uri);
  }
  return 'Open Link';
}


interface LinkToolbarProps {
  link: PdfLibLink;
  scale: number;
  flipped: boolean;
  onNavigate: (link: PdfLibLink) => void;
  onDelete: (link: PdfLibLink) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const TOOLBAR_HEIGHT = 32;
const TOOLBAR_GAP = 8;

const LinkToolbar: React.FC<LinkToolbarProps> = React.memo(
  ({ link, scale, flipped, onNavigate, onDelete, onMouseEnter, onMouseLeave }) => {
    const centerX = (link.rect.x + link.rect.width / 2) * scale;
    const topY = flipped
      ? (link.rect.y + link.rect.height) * scale + TOOLBAR_GAP
      : link.rect.y * scale - TOOLBAR_HEIGHT - TOOLBAR_GAP;

    const isInternal = link.type === 'internal' && link.targetPage !== undefined;
    const label = getLinkLabel(link);

    return (
      <div
        className={`pdf-link-toolbar${flipped ? ' pdf-link-toolbar--below' : ''}`}
        style={{ left: `${centerX}px`, top: `${topY}px` }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Delete */}
        <button
          type="button"
          className="pdf-link-toolbar-btn pdf-link-toolbar-btn--delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(link);
          }}
          aria-label="Delete link"
          title="Delete link"
        >
          <TrashIcon />
        </button>

        <span className="pdf-link-toolbar-sep" />

        {/* Navigate / Open */}
        <button
          type="button"
          className="pdf-link-toolbar-btn pdf-link-toolbar-btn--go"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(link);
          }}
          aria-label={isInternal ? `Go to page ${(link.targetPage ?? 0) + 1}` : 'Open link'}
          title={isInternal ? `Go to page ${(link.targetPage ?? 0) + 1}` : link.uri ?? 'Open link'}
        >
          {isInternal ? <PageIcon /> : <ExternalLinkIcon />}
          <span className="pdf-link-toolbar-label">{label}</span>
        </button>
      </div>
    );
  },
);

LinkToolbar.displayName = 'LinkToolbar';

interface LinkLayerProps {
  documentId: string;
  pageIndex: number;
  _pageWidth: number;
  _pageHeight: number;
  /** Blob/object URL of the current PDF (needed by pdf-lib). */
  pdfUrl: string | null;
}

export const LinkLayer: React.FC<LinkLayerProps> = ({
  documentId,
  pageIndex,
  _pageWidth,
  _pageHeight,
  pdfUrl,
}) => {
  const { provides: scroll } = useScroll(documentId);
  const { provides: annotation } = useAnnotationCapability();
  const documentState = useDocumentState(documentId);

  // State
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [deletedLinkIds, setDeletedLinkIds] = useState<Set<string>>(new Set());
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // pdf-lib extraction
  const { links } = usePdfLibLinks(pdfUrl, pageIndex);

  // EmbedPDF scale factor
  const scale = documentState?.scale ?? 1;

  // Filter visible, non-deleted links
  const visibleLinks = useMemo(
    () =>
      links.filter(
        (l) => l.rect.width > 0 && l.rect.height > 0 && !deletedLinkIds.has(l.id),
      ),
    [links, deletedLinkIds],
  );


  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const startLeaveTimer = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setHoveredLinkId(null);
    }, 120);
  }, [clearLeaveTimer]);

  const handleLinkMouseEnter = useCallback(
    (linkId: string) => {
      clearLeaveTimer();
      setHoveredLinkId(linkId);
    },
    [clearLeaveTimer],
  );

  const handleLinkMouseLeave = useCallback(() => {
    startLeaveTimer();
  }, [startLeaveTimer]);

  const handleToolbarMouseEnter = useCallback(() => {
    clearLeaveTimer();
  }, [clearLeaveTimer]);

  const handleToolbarMouseLeave = useCallback(() => {
    startLeaveTimer();
  }, [startLeaveTimer]);

  const handleNavigate = useCallback(
    (link: PdfLibLink) => {
      if (link.type === 'internal' && link.targetPage !== undefined && scroll) {
        scroll.scrollToPage({
          pageNumber: link.targetPage + 1,
          behavior: 'smooth',
        });
      } else if (link.uri) {
        try {
          const url = new URL(link.uri, window.location.href);
          if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
            window.open(link.uri, '_blank', 'noopener,noreferrer');
          } else {
            console.warn('[LinkLayer] Blocked unsafe URL protocol:', url.protocol);
          }
        } catch {
          window.open(link.uri, '_blank', 'noopener,noreferrer');
        }
      }
      setHoveredLinkId(null);
    },
    [scroll],
  );

  const handleDelete = useCallback(
    async (link: PdfLibLink) => {
      setDeletedLinkIds((prev) => new Set(prev).add(link.id));
      setHoveredLinkId(null);

      if (!annotation) return;

      try {
        const result = annotation.getPageAnnotations({ pageIndex });

        let pageAnnotations: any[] = [];
        if (result && typeof (result as any).toPromise === 'function') {
          pageAnnotations = await (result as any).toPromise();
        } else if (result && typeof (result as any).then === 'function') {
          pageAnnotations = await (result as unknown as Promise<any[]>);
        } else if (Array.isArray(result)) {
          pageAnnotations = result;
        }

        const match = pageAnnotations.find((ann: any) => {
          if (
            ann.type !== 2 &&
            ann.type !== PdfAnnotationSubtype.LINK
          )
            return false;
          if (!ann.rect) return false;

          // EmbedPDF rects: { origin: { x, y }, size: { width, height } }
          const r = ann.rect;
          const tol = 2; // tolerance in PDF points
          return (
            Math.abs((r.origin?.x ?? r.x ?? 0) - link.rect.x) <= tol &&
            Math.abs((r.origin?.y ?? r.y ?? 0) - link.rect.y) <= tol &&
            Math.abs((r.size?.width ?? r.width ?? 0) - link.rect.width) <= tol &&
            Math.abs((r.size?.height ?? r.height ?? 0) - link.rect.height) <= tol
          );
        });

        if (match?.id) {
          // Use EmbedPDF's native deletion (integrates with history / export)
          if (typeof (annotation as any).deleteAnnotation === 'function') {
            (annotation as any).deleteAnnotation(pageIndex, match.id);
          } else if (typeof (annotation as any).purgeAnnotation === 'function') {
            (annotation as any).purgeAnnotation(pageIndex, match.id);
          }
        }
      } catch (e) {
        console.warn('[LinkLayer] Could not delete annotation via EmbedPDF:', e);
      }
    },
    [annotation, pageIndex],
  );

  if (visibleLinks.length === 0) return null;

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: 'none', zIndex: 10 }}
    >
      {visibleLinks.map((link) => {
        const isHovered = hoveredLinkId === link.id;
        const left = link.rect.x * scale;
        const top = link.rect.y * scale;
        const width = link.rect.width * scale;
        const height = link.rect.height * scale;

        // Flip toolbar below if link is near the top of the page
        const flipped = link.rect.y * scale < TOOLBAR_HEIGHT + TOOLBAR_GAP + 4;

        return (
          <React.Fragment key={link.id}>
            {/* Hit-area overlay */}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNavigate(link);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => handleLinkMouseEnter(link.id)}
              onMouseLeave={handleLinkMouseLeave}
              className={`pdf-link-overlay${isHovered ? ' pdf-link-overlay--active' : ''}`}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                minWidth: '6px',
                minHeight: '6px',
              }}
              role="link"
              tabIndex={0}
              aria-label={getLinkLabel(link)}
            />

            {/* Floating toolbar */}
            {isHovered && (
              <LinkToolbar
                link={link}
                scale={scale}
                flipped={flipped}
                onNavigate={handleNavigate}
                onDelete={handleDelete}
                onMouseEnter={handleToolbarMouseEnter}
                onMouseLeave={handleToolbarMouseLeave}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
