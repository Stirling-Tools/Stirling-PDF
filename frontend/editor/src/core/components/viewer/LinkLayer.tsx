import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useDocumentState } from "@embedpdf/core/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useAnnotation } from "@embedpdf/plugin-annotation/react";
import {
  PdfAnnotationSubtype,
  PdfActionType,
  type PdfLinkAnnoObject,
} from "@embedpdf/models";
import { Z_INDEX_VIEWER_FLOATING_MENU } from "@app/styles/zIndex";

// ---------------------------------------------------------------------------
// Inline SVG icons (thin-stroke, modern)
// ---------------------------------------------------------------------------

const TrashIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
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
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
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
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
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
    const display = u.hostname + (u.pathname !== "/" ? u.pathname : "");
    return display.length > maxLen
      ? display.slice(0, maxLen) + "\u2026"
      : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "\u2026" : url;
  }
}

function getLinkLabel(annotationLink: PdfLinkAnnoObject): string {
  if (!annotationLink.target) return "Open Link";

  if (annotationLink.target.type === "action") {
    const action = annotationLink.target.action;
    if (action.type === PdfActionType.URI) return truncateUrl(action.uri);
    if (action.type === PdfActionType.Goto)
      return `Page ${action.destination.pageIndex + 1}`;
    if (action.type === PdfActionType.RemoteGoto)
      return `Page ${action.destination.pageIndex + 1}`;
  } else if (annotationLink.target.type === "destination") {
    return `Page ${annotationLink.target.destination.pageIndex + 1}`;
  }

  return "Open Link";
}

function isInternalLink(annotationLink: PdfLinkAnnoObject): boolean {
  if (!annotationLink.target) return false;
  if (annotationLink.target.type === "destination") return true;
  if (annotationLink.target.type === "action") {
    const { type } = annotationLink.target.action;
    return type === PdfActionType.Goto || type === PdfActionType.RemoteGoto;
  }
  return false;
}

// ---------------------------------------------------------------------------
// LinkToolbar
// ---------------------------------------------------------------------------

interface LinkToolbarProps {
  annotationLink: PdfLinkAnnoObject;
  toolbarRef: React.Ref<HTMLDivElement>;
  left: number;
  top: number;
  flipped: boolean;
  onNavigate: (annotationLink: PdfLinkAnnoObject) => void;
  onDelete: (annotationLink: PdfLinkAnnoObject) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const TOOLBAR_HEIGHT = 32;
const TOOLBAR_GAP = 8;
const TOOLBAR_EDGE_MARGIN = 4;
const TOOLBAR_LEAVE_DELAY = 120;

interface ToolbarPlacement {
  linkId: string;
  left: number;
  top: number;
  flipped: boolean;
}

function clampToolbarCenter(centerX: number, toolbarWidth: number): number {
  if (toolbarWidth <= 0 || typeof window === "undefined") return centerX;

  const minCenter = TOOLBAR_EDGE_MARGIN + toolbarWidth / 2;
  const maxCenter = window.innerWidth - TOOLBAR_EDGE_MARGIN - toolbarWidth / 2;

  if (minCenter > maxCenter) return window.innerWidth / 2;
  return Math.min(Math.max(centerX, minCenter), maxCenter);
}

function isRectOutsideViewport(rect: DOMRect): boolean {
  if (typeof window === "undefined") return false;

  return (
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  );
}

const LinkToolbar: React.FC<LinkToolbarProps> = React.memo(
  ({
    annotationLink,
    toolbarRef,
    left,
    top,
    flipped,
    onNavigate,
    onDelete,
    onMouseEnter,
    onMouseLeave,
  }) => {
    const { t } = useTranslation();
    const internal = isInternalLink(annotationLink);
    const label = getLinkLabel(annotationLink);

    return (
      <div
        ref={toolbarRef}
        className={`pdf-link-toolbar${flipped ? " pdf-link-toolbar--below" : ""}`}
        style={{
          position: "fixed",
          left: `${left}px`,
          top: `${top}px`,
          maxWidth: `calc(100vw - ${TOOLBAR_EDGE_MARGIN * 2}px)`,
          zIndex: Z_INDEX_VIEWER_FLOATING_MENU,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Delete */}
        <button
          type="button"
          className="pdf-link-toolbar-btn pdf-link-toolbar-btn--delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(annotationLink);
          }}
          aria-label={t("viewer.link.delete", "Delete link")}
          title={t("viewer.link.delete", "Delete link")}
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
            onNavigate(annotationLink);
          }}
          aria-label={internal ? `Go to ${label}` : "Open link"}
          title={label}
        >
          {internal ? <PageIcon /> : <ExternalLinkIcon />}
          <span className="pdf-link-toolbar-label">{label}</span>
        </button>
      </div>
    );
  },
);

LinkToolbar.displayName = "LinkToolbar";

// ---------------------------------------------------------------------------
// LinkLayer
// ---------------------------------------------------------------------------

interface LinkLayerProps {
  documentId: string;
  pageIndex: number;
}

export const LinkLayer: React.FC<LinkLayerProps> = ({
  documentId,
  pageIndex,
}) => {
  const { provides: scroll } = useScroll(documentId);
  const { state, provides: scope } = useAnnotation(documentId);
  const documentState = useDocumentState(documentId);

  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [toolbarPlacement, setToolbarPlacement] =
    useState<ToolbarPlacement | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkElementRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const toolbarElementRef = useRef<HTMLDivElement | null>(null);

  // Extract link annotations for this page from EmbedPDF annotation state
  const linkAnnotations = useMemo<PdfLinkAnnoObject[]>(() => {
    if (!state) return [];
    const uids = state.pages[pageIndex] ?? [];
    const result: PdfLinkAnnoObject[] = [];
    for (const uid of uids) {
      const ta = state.byUid[uid];
      if (
        ta &&
        ta.commitState !== "deleted" &&
        ta.object.type === PdfAnnotationSubtype.LINK
      ) {
        const annotationLink = ta.object as PdfLinkAnnoObject;
        if (
          annotationLink.rect.size.width > 0 &&
          annotationLink.rect.size.height > 0
        ) {
          result.push(annotationLink);
        }
      }
    }
    return result;
  }, [state, pageIndex]);

  // EmbedPDF scale factor (annotation rects are in PDF points at scale 1)
  const scale = documentState?.scale ?? 1;
  // The portal position is measured from DOM, so this key realigns it when the page transform changes.
  const toolbarPositionKey = [
    scale,
    documentState?.document?.pages?.[pageIndex]?.rotation ?? 0,
    documentState?.rotation ?? 0,
  ].join(":");

  const updateToolbarPlacement = useCallback((linkId: string | null) => {
    if (!linkId) {
      setToolbarPlacement(null);
      return;
    }

    const linkElement = linkElementRefs.current.get(linkId);
    if (!linkElement) {
      setHoveredLinkId(null);
      setToolbarPlacement(null);
      return;
    }

    if (typeof window === "undefined") return;

    const rect = linkElement.getBoundingClientRect();
    if (isRectOutsideViewport(rect)) {
      setHoveredLinkId(null);
      setToolbarPlacement(null);
      return;
    }

    const toolbarWidth = toolbarElementRef.current?.offsetWidth ?? 0;
    const verticalSpace = TOOLBAR_HEIGHT + TOOLBAR_GAP + TOOLBAR_EDGE_MARGIN;
    const fitsAbove = rect.top >= verticalSpace;
    const fitsBelow = window.innerHeight - rect.bottom >= verticalSpace;
    const centerX = rect.left + rect.width / 2;
    const flipped = !fitsAbove && fitsBelow;
    const top = flipped
      ? rect.bottom + TOOLBAR_GAP
      : Math.max(TOOLBAR_EDGE_MARGIN, rect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP);

    setToolbarPlacement({
      linkId,
      left: clampToolbarCenter(centerX, toolbarWidth),
      top,
      flipped,
    });
  }, []);

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
      setToolbarPlacement(null);
    }, TOOLBAR_LEAVE_DELAY);
  }, [clearLeaveTimer]);

  const handleLinkMouseEnter = useCallback(
    (id: string) => {
      clearLeaveTimer();
      setHoveredLinkId(id);
      updateToolbarPlacement(id);
    },
    [clearLeaveTimer, updateToolbarPlacement],
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
    (annotationLink: PdfLinkAnnoObject) => {
      if (!annotationLink.target) {
        setHoveredLinkId(null);
        setToolbarPlacement(null);
        return;
      }

      if (annotationLink.target.type === "destination" && scroll) {
        scroll.scrollToPage({
          pageNumber: annotationLink.target.destination.pageIndex + 1,
          behavior: "smooth",
        });
      } else if (annotationLink.target.type === "action") {
        const action = annotationLink.target.action;
        if (action.type === PdfActionType.Goto && scroll) {
          scroll.scrollToPage({
            pageNumber: action.destination.pageIndex + 1,
            behavior: "smooth",
          });
        } else if (action.type === PdfActionType.RemoteGoto && scroll) {
          scroll.scrollToPage({
            pageNumber: action.destination.pageIndex + 1,
            behavior: "smooth",
          });
        } else if (action.type === PdfActionType.URI) {
          const uri = action.uri;
          try {
            const url = new URL(uri, window.location.href);
            if (["http:", "https:", "mailto:"].includes(url.protocol)) {
              window.open(uri, "_blank", "noopener,noreferrer");
            } else {
              console.warn(
                "[LinkLayer] Blocked unsafe URL protocol:",
                url.protocol,
              );
            }
          } catch {
            window.open(uri, "_blank", "noopener,noreferrer");
          }
        }
      }

      setHoveredLinkId(null);
      setToolbarPlacement(null);
    },
    [scroll],
  );

  const handleDelete = useCallback(
    (annotationLink: PdfLinkAnnoObject) => {
      setHoveredLinkId(null);
      setToolbarPlacement(null);
      if (!scope) return;
      scope.deleteAnnotation(pageIndex, annotationLink.id);
    },
    [scope, pageIndex],
  );

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  useEffect(() => {
    if (!hoveredLinkId) {
      setToolbarPlacement(null);
      return;
    }

    updateToolbarPlacement(hoveredLinkId);

    if (typeof window === "undefined") return;

    const handleViewportChange = () => {
      updateToolbarPlacement(hoveredLinkId);
    };

    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [
    hoveredLinkId,
    linkAnnotations,
    toolbarPositionKey,
    updateToolbarPlacement,
  ]);

  useLayoutEffect(() => {
    if (!hoveredLinkId || toolbarPlacement?.linkId !== hoveredLinkId) return;
    updateToolbarPlacement(hoveredLinkId);
  }, [
    hoveredLinkId,
    toolbarPlacement?.linkId,
    toolbarPositionKey,
    updateToolbarPlacement,
  ]);

  const hoveredAnnotationLink = useMemo(
    () => linkAnnotations.find((link) => link.id === hoveredLinkId) ?? null,
    [linkAnnotations, hoveredLinkId],
  );

  if (linkAnnotations.length === 0) return null;

  const toolbarPortal =
    hoveredAnnotationLink &&
    toolbarPlacement?.linkId === hoveredAnnotationLink.id &&
    typeof document !== "undefined"
      ? createPortal(
          <LinkToolbar
            annotationLink={hoveredAnnotationLink}
            toolbarRef={toolbarElementRef}
            left={toolbarPlacement.left}
            top={toolbarPlacement.top}
            flipped={toolbarPlacement.flipped}
            onNavigate={handleNavigate}
            onDelete={handleDelete}
            onMouseEnter={handleToolbarMouseEnter}
            onMouseLeave={handleToolbarMouseLeave}
          />,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ pointerEvents: "none", zIndex: 10 }}
      >
        {linkAnnotations.map((annotationLink) => {
          const isHovered = hoveredLinkId === annotationLink.id;
          const left = annotationLink.rect.origin.x * scale;
          const top = annotationLink.rect.origin.y * scale;
          const width = annotationLink.rect.size.width * scale;
          const height = annotationLink.rect.size.height * scale;

          return (
            <a
              key={annotationLink.id}
              ref={(node) => {
                if (node) {
                  linkElementRefs.current.set(annotationLink.id, node);
                } else {
                  linkElementRefs.current.delete(annotationLink.id);
                }
              }}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNavigate(annotationLink);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => handleLinkMouseEnter(annotationLink.id)}
              onMouseLeave={handleLinkMouseLeave}
              className={`pdf-link-overlay${isHovered ? " pdf-link-overlay--active" : ""}`}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                minWidth: "6px",
                minHeight: "6px",
              }}
              role="link"
              tabIndex={0}
              aria-label={getLinkLabel(annotationLink)}
            />
          );
        })}
      </div>
      {toolbarPortal}
    </>
  );
};
