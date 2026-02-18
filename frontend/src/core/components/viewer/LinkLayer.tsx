import React, { useCallback, useState, useMemo, useRef } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useAnnotation } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, PdfActionType, type PdfLinkAnnoObject } from '@embedpdf/models';

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

function getLinkLabel(ann: PdfLinkAnnoObject): string {
  if (!ann.target) return 'Open Link';

  if (ann.target.type === 'action') {
    const action = ann.target.action;
    if (action.type === PdfActionType.URI) return truncateUrl(action.uri);
    if (action.type === PdfActionType.Goto) return `Page ${action.destination.pageIndex + 1}`;
    if (action.type === PdfActionType.RemoteGoto) return `Page ${action.destination.pageIndex + 1}`;
  } else if (ann.target.type === 'destination') {
    return `Page ${ann.target.destination.pageIndex + 1}`;
  }

  return 'Open Link';
}

function isInternalLink(ann: PdfLinkAnnoObject): boolean {
  if (!ann.target) return false;
  if (ann.target.type === 'destination') return true;
  if (ann.target.type === 'action') {
    const { type } = ann.target.action;
    return type === PdfActionType.Goto || type === PdfActionType.RemoteGoto;
  }
  return false;
}

// ---------------------------------------------------------------------------
// LinkToolbar
// ---------------------------------------------------------------------------

interface LinkToolbarProps {
  ann: PdfLinkAnnoObject;
  scale: number;
  flipped: boolean;
  onNavigate: (ann: PdfLinkAnnoObject) => void;
  onDelete: (ann: PdfLinkAnnoObject) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const TOOLBAR_HEIGHT = 32;
const TOOLBAR_GAP = 8;

const LinkToolbar: React.FC<LinkToolbarProps> = React.memo(
  ({ ann, scale, flipped, onNavigate, onDelete, onMouseEnter, onMouseLeave }) => {
    const centerX = (ann.rect.origin.x + ann.rect.size.width / 2) * scale;
    const topY = flipped
      ? (ann.rect.origin.y + ann.rect.size.height) * scale + TOOLBAR_GAP
      : ann.rect.origin.y * scale - TOOLBAR_HEIGHT - TOOLBAR_GAP;

    const internal = isInternalLink(ann);
    const label = getLinkLabel(ann);

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
            onDelete(ann);
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
            onNavigate(ann);
          }}
          aria-label={internal ? `Go to page ${ann.target?.type === 'destination' ? ann.target.destination.pageIndex + 1 : ''}` : 'Open link'}
          title={label}
        >
          {internal ? <PageIcon /> : <ExternalLinkIcon />}
          <span className="pdf-link-toolbar-label">{label}</span>
        </button>
      </div>
    );
  },
);

LinkToolbar.displayName = 'LinkToolbar';

// ---------------------------------------------------------------------------
// LinkLayer
// ---------------------------------------------------------------------------

interface LinkLayerProps {
  documentId: string;
  pageIndex: number;
}

export const LinkLayer: React.FC<LinkLayerProps> = ({ documentId, pageIndex }) => {
  const { provides: scroll } = useScroll(documentId);
  const { state, provides: scope } = useAnnotation(documentId);
  const documentState = useDocumentState(documentId);

  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract link annotations for this page from EmbedPDF annotation state
  const linkAnnotations = useMemo<PdfLinkAnnoObject[]>(() => {
    if (!state) return [];
    const uids = state.pages[pageIndex] ?? [];
    const result: PdfLinkAnnoObject[] = [];
    for (const uid of uids) {
      const ta = state.byUid[uid];
      if (
        ta &&
        ta.commitState !== 'deleted' &&
        ta.object.type === PdfAnnotationSubtype.LINK
      ) {
        const ann = ta.object as PdfLinkAnnoObject;
        if (ann.rect.size.width > 0 && ann.rect.size.height > 0) {
          result.push(ann);
        }
      }
    }
    return result;
  }, [state, pageIndex]);

  // EmbedPDF scale factor (annotation rects are in PDF points at scale 1)
  const scale = documentState?.scale ?? 1;

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
    (id: string) => {
      clearLeaveTimer();
      setHoveredLinkId(id);
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
    (ann: PdfLinkAnnoObject) => {
      if (!ann.target) {
        setHoveredLinkId(null);
        return;
      }

      if (ann.target.type === 'destination' && scroll) {
        scroll.scrollToPage({
          pageNumber: ann.target.destination.pageIndex + 1,
          behavior: 'smooth',
        });
      } else if (ann.target.type === 'action') {
        const action = ann.target.action;
        if (action.type === PdfActionType.Goto && scroll) {
          scroll.scrollToPage({
            pageNumber: action.destination.pageIndex + 1,
            behavior: 'smooth',
          });
        } else if (action.type === PdfActionType.RemoteGoto && scroll) {
          scroll.scrollToPage({
            pageNumber: action.destination.pageIndex + 1,
            behavior: 'smooth',
          });
        } else if (action.type === PdfActionType.URI) {
          const uri = action.uri;
          try {
            const url = new URL(uri, window.location.href);
            if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
              window.open(uri, '_blank', 'noopener,noreferrer');
            } else {
              console.warn('[LinkLayer] Blocked unsafe URL protocol:', url.protocol);
            }
          } catch {
            window.open(uri, '_blank', 'noopener,noreferrer');
          }
        }
      }

      setHoveredLinkId(null);
    },
    [scroll],
  );

  const handleDelete = useCallback(
    (ann: PdfLinkAnnoObject) => {
      setHoveredLinkId(null);
      if (!scope) return;
      scope.deleteAnnotation(pageIndex, ann.id);
    },
    [scope, pageIndex],
  );

  if (linkAnnotations.length === 0) return null;

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: 'none', zIndex: 10 }}
    >
      {linkAnnotations.map((ann) => {
        const isHovered = hoveredLinkId === ann.id;
        const left = ann.rect.origin.x * scale;
        const top = ann.rect.origin.y * scale;
        const width = ann.rect.size.width * scale;
        const height = ann.rect.size.height * scale;

        // Flip toolbar below if link is near the top of the page
        const flipped = ann.rect.origin.y * scale < TOOLBAR_HEIGHT + TOOLBAR_GAP + 4;

        return (
          <React.Fragment key={ann.id}>
            {/* Hit-area overlay */}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNavigate(ann);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => handleLinkMouseEnter(ann.id)}
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
              aria-label={getLinkLabel(ann)}
            />

            {/* Floating toolbar */}
            {isHovered && (
              <LinkToolbar
                ann={ann}
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
