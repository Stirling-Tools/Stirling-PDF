import LocalIcon from "@app/components/shared/LocalIcon";
import type { PdfAnnotationObject } from "@embedpdf/models";

// Shared display helpers for anything that lists PDF annotations generically
// (CommentsSidebar, MarkupsListSidebar) — icon/label per annotation type,
// author resolution, and date formatting. Kept separate from either sidebar
// since neither one "owns" these; both are just different views over the
// same annotation data.

type StirlingAnnotationCustomData = Record<string, unknown> & {
  annotationToolId?: string;
  isComment?: boolean;
  modifiedDate?: Date | number | string;
  toolId?: string;
};

type StirlingAnnotationMetadata = {
  creationDate?: Date | number | string;
  customData?: StirlingAnnotationCustomData;
  M?: Date | number | string;
  modifiedDate?: Date | number | string;
};

function getStirlingAnnotationMetadata(
  ann: PdfAnnotationObject,
): StirlingAnnotationMetadata {
  return ann as StirlingAnnotationMetadata;
}

/** Format annotation date for display (e.g. "Mar 11, 6:05 PM"). */
export function formatAnnotationDate(obj: PdfAnnotationObject): string {
  const metadata = getStirlingAnnotationMetadata(obj);
  const raw =
    metadata.modifiedDate ??
    metadata.creationDate ??
    metadata.customData?.modifiedDate ??
    metadata.M;
  if (raw == null) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Placeholder authors we never show; use current user's name from context instead. */
const PLACEHOLDER_AUTHORS = new Set(["Guest", "Digital Signature", ""]);
export function getAuthorName(
  obj: Pick<PdfAnnotationObject, "author">,
  currentDisplayName: string,
): string {
  const stored = (obj?.author ?? "Guest").trim() || "Guest";
  if (PLACEHOLDER_AUTHORS.has(stored)) return currentDisplayName || "Guest";
  return stored;
}

// Map toolId → LocalIcon icon name (matches AnnotationPanel icon definitions)
const TOOL_ICON_MAP: Record<string, string> = {
  highlight: "highlight",
  underline: "format-underlined",
  strikeout: "strikethrough-s",
  squiggly: "show-chart",
  ink: "edit",
  inkHighlighter: "brush",
  square: "crop-square-outline",
  circle: "radio-button-unchecked",
  line: "show-chart",
  lineArrow: "show-chart",
  polyline: "show-chart",
  polygon: "change-history",
  cloud: "cloud-outline",
  text: "text-fields",
  note: "sticky-note-2",
  stamp: "add-photo-alternate",
  textComment: "comment",
  insertText: "add-comment",
  replaceText: "find-replace",
};

// Type-based fallback icon when no toolId is present
function getIconByType(type: number | undefined): string {
  if (type === 1) return "comment";
  if (type === 3) return "sticky-note-2";
  if (type === 4 || type === 8) return "show-chart";
  if (type === 5) return "crop-square-outline";
  if (type === 6) return "radio-button-unchecked";
  if (type === 7) return "change-history";
  if (type === 9) return "highlight";
  if (type === 10) return "format-underlined";
  if (type === 11) return "show-chart";
  if (type === 12) return "strikethrough-s";
  if (type === 13) return "add-photo-alternate";
  if (type === 14) return "add-comment";
  if (type === 15) return "edit";
  return "comment";
}

export function getAnnotationToolId(ann: PdfAnnotationObject): string {
  const customData = getStirlingAnnotationMetadata(ann).customData;
  return customData?.toolId ?? customData?.annotationToolId ?? "";
}

export function getAnnotationTypeLabel(
  ann: PdfAnnotationObject,
  t: (key: string, fallback: string) => string,
): string {
  const toolId = getAnnotationToolId(ann);
  const labels: Record<string, string> = {
    highlight: t("annotation.highlight", "Highlight"),
    underline: t("annotation.underline", "Underline"),
    strikeout: t("annotation.strikeout", "Strikeout"),
    squiggly: t("annotation.squiggly", "Squiggly"),
    ink: t("annotation.pen", "Pen"),
    inkHighlighter: t("annotation.freehandHighlighter", "Freehand Highlighter"),
    square: t("annotation.square", "Square"),
    circle: t("annotation.circle", "Circle"),
    line: t("annotation.line", "Line"),
    lineArrow: t("annotation.lineArrow", "Arrow"),
    polyline: t("annotation.polyline", "Polyline"),
    polygon: t("annotation.polygon", "Polygon"),
    cloud: t("annotation.cloud", "Cloud"),
    text: t("annotation.text", "Text box"),
    note: t("annotation.note", "Note"),
    stamp: t("annotation.stamp", "Stamp"),
    textComment: t("viewer.comments.typeComment", "Comment"),
    insertText: t("viewer.comments.typeInsertText", "Insert Text"),
    replaceText: t("viewer.comments.typeReplaceText", "Replace Text"),
  };
  if (labels[toolId]) return labels[toolId];
  // Type-based fallback (mirrors getIconByType) for annotations without customData.toolId
  const type = ann?.type;
  if (type === 14) return t("viewer.comments.typeInsertText", "Insert Text");
  if (type === 1) return t("viewer.comments.typeComment", "Comment");
  return t("viewer.comments.typeComment", "Comment");
}

export function AnnotationTypeIcon({ ann }: { ann: PdfAnnotationObject }) {
  const toolId = getAnnotationToolId(ann);
  const iconName = TOOL_ICON_MAP[toolId] ?? getIconByType(ann?.type);
  return (
    <LocalIcon
      icon={iconName}
      width="1.25rem"
      height="1.25rem"
      style={{ flexShrink: 0, color: "var(--c-accent-text)" }}
    />
  );
}

/**
 * Scrolls to an annotation's page and flashes a highlight box over its rect.
 * Shared by CommentsSidebar and MarkupsListSidebar's "locate" actions.
 */
export function locateAnnotationOnPage(
  pageIndex: number,
  ann: PdfAnnotationObject,
  helpers: {
    scrollToPage?: (page: number, behavior?: "smooth" | "instant") => void;
    getCurrentZoom?: () => number | undefined;
  },
): void {
  helpers.scrollToPage?.(pageIndex + 1, "smooth");
  setTimeout(() => {
    const pageEl = document.querySelector<HTMLElement>(
      `[data-page-index="${pageIndex}"]`,
    );
    if (!pageEl || !ann?.rect) return;
    const zoom = helpers.getCurrentZoom?.() ?? 1;
    const { origin, size } = ann.rect as {
      origin: { x: number; y: number };
      size: { width: number; height: number };
    };
    const flashEl = document.createElement("div");
    // Append to page element so it scrolls with the page (position: absolute relative to page)
    flashEl.style.cssText = `
        position: absolute;
        left: ${origin.x * zoom}px;
        top: ${origin.y * zoom}px;
        width: ${size.width * zoom}px;
        height: ${size.height * zoom}px;
        background: rgba(255, 213, 0, 0.55);
        border: 2px solid rgba(255, 170, 0, 0.8);
        border-radius: 3px;
        pointer-events: none;
        z-index: 9998;
        animation: annotation-locate-flash 1.6s ease-out forwards;
      `;
    if (!document.getElementById("annotation-locate-flash-style")) {
      const style = document.createElement("style");
      style.id = "annotation-locate-flash-style";
      style.textContent = `@keyframes annotation-locate-flash {
          0%   { opacity: 0; transform: scale(1.08); }
          15%  { opacity: 1; transform: scale(1); }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }`;
      document.head.appendChild(style);
    }
    pageEl.appendChild(flashEl);
    setTimeout(() => flashEl.remove(), 1700);
  }, 550);
}

/**
 * Best-effort color swatch for an annotation. Color isn't on the base
 * PdfAnnotationObject type — it's declared per-subtype (strokeColor is the
 * "main" hue for shapes/markup/ink; color is either a fill or a deprecated
 * alias) — so this reads generically rather than switching on every subtype.
 */
export function getAnnotationColor(
  ann: PdfAnnotationObject,
): string | undefined {
  const withColors = ann as PdfAnnotationObject & {
    strokeColor?: string;
    color?: string;
  };
  return withColors.strokeColor ?? withColors.color;
}
