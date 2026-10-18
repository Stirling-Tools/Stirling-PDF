import type {
  AnnotationCapability,
  AnnotationTool,
} from "@embedpdf/plugin-annotation";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfAnnotationObject } from "@embedpdf/models";

// LooseAnnotationTool bypasses strict Partial<T> defaults typing from the library:
// EmbedPDF accepts extra runtime properties (borderWidth, textColor, finishOnDoubleClick,
// etc.) that aren't reflected in the TypeScript model types.
type LooseAnnotationTool = {
  id: string;
  name: string;
  interaction?: {
    exclusive: boolean;
    cursor: string;
    textSelection?: boolean;
    isRotatable?: boolean;
  };
  matchScore?: (annotation: PdfAnnotationObject) => number;
  defaults?: Record<string, unknown>;
  clickBehavior?: Record<string, unknown>;
  behavior?: {
    deactivateToolAfterCreate?: boolean;
    selectAfterCreate?: boolean;
  };
};

/** Adds the viewer's annotation tools to the plugin, skipping any it already has. */
export function registerAnnotationTools(
  annotationApi: Pick<AnnotationCapability, "getTool" | "addTool">,
): void {
  const ensureTool = (tool: LooseAnnotationTool) => {
    const existing = annotationApi.getTool?.(tool.id);
    if (!existing) {
      annotationApi.addTool(tool as unknown as AnnotationTool);
    }
  };

  ensureTool({
    id: "highlight",
    name: "Highlight",
    interaction: {
      exclusive: true,
      cursor: "text",
      textSelection: true,
    },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.HIGHLIGHT ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.HIGHLIGHT,
      strokeColor: "#ffd54f",
      color: "#ffd54f",
      opacity: 0.6,
    },
    behavior: {
      deactivateToolAfterCreate: false,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "underline",
    name: "Underline",
    interaction: {
      exclusive: true,
      cursor: "text",
      textSelection: true,
    },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.UNDERLINE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.UNDERLINE,
      strokeColor: "#ffb300",
      color: "#ffb300",
      opacity: 1,
    },
    behavior: {
      deactivateToolAfterCreate: false,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "strikeout",
    name: "Strikeout",
    interaction: {
      exclusive: true,
      cursor: "text",
      textSelection: true,
    },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.STRIKEOUT ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.STRIKEOUT,
      strokeColor: "#e53935",
      color: "#e53935",
      opacity: 1,
    },
    behavior: {
      deactivateToolAfterCreate: false,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "squiggly",
    name: "Squiggly",
    interaction: {
      exclusive: true,
      cursor: "text",
      textSelection: true,
    },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.SQUIGGLY ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.SQUIGGLY,
      strokeColor: "#00acc1",
      color: "#00acc1",
      opacity: 1,
    },
    behavior: {
      deactivateToolAfterCreate: false,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "ink",
    name: "Pen",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.INK ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.INK,
      strokeColor: "#1f2933",
      color: "#1f2933",
      opacity: 1,
      borderWidth: 2,
      lineWidth: 2,
      strokeWidth: 2,
    },
    behavior: {
      deactivateToolAfterCreate: false,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "inkHighlighter",
    name: "Ink Highlighter",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.INK &&
      (annotation.strokeColor === "#ffd54f" || annotation.color === "#ffd54f")
        ? 8
        : 0,
    defaults: {
      type: PdfAnnotationSubtype.INK,
      strokeColor: "#ffd54f",
      color: "#ffd54f",
      opacity: 0.5,
      borderWidth: 6,
      lineWidth: 6,
      strokeWidth: 6,
    },
    behavior: {
      deactivateToolAfterCreate: false,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "square",
    name: "Square",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.SQUARE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.SQUARE,
      color: "#0000ff", // fill color (blue)
      strokeColor: "#cf5b5b", // border color (reddish pink)
      opacity: 0.5,
      borderWidth: 1,
      strokeWidth: 1,
      lineWidth: 1,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 120, height: 90 },
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "circle",
    name: "Circle",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.CIRCLE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.CIRCLE,
      color: "#0000ff", // fill color (blue)
      strokeColor: "#cf5b5b", // border color (reddish pink)
      opacity: 0.5,
      borderWidth: 1,
      strokeWidth: 1,
      lineWidth: 1,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 100, height: 100 },
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "line",
    name: "Line",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.LINE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.LINE,
      color: "#1565c0",
      opacity: 1,
      borderWidth: 2,
      strokeWidth: 2,
      lineWidth: 2,
    },
    clickBehavior: {
      enabled: true,
      defaultLength: 120,
      defaultAngle: 0,
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "lineArrow",
    name: "Arrow",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) => {
      if (annotation.type !== PdfAnnotationSubtype.LINE) return 0;
      // EmbedPDF stores endStyle/lineEndingStyles at runtime; library types use lineEndings
      const ann = annotation as PdfAnnotationObject & {
        endStyle?: string;
        lineEndingStyles?: { end?: string };
      };
      return ann.endStyle === "ClosedArrow" ||
        ann.lineEndingStyles?.end === "ClosedArrow"
        ? 9
        : 0;
    },
    defaults: {
      type: PdfAnnotationSubtype.LINE,
      color: "#1565c0",
      opacity: 1,
      borderWidth: 2,
      startStyle: "None",
      endStyle: "ClosedArrow",
      lineEndingStyles: { start: "None", end: "ClosedArrow" },
    },
    clickBehavior: {
      enabled: true,
      defaultLength: 120,
      defaultAngle: 0,
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "polyline",
    name: "Polyline",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.POLYLINE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.POLYLINE,
      color: "#1565c0",
      opacity: 1,
      borderWidth: 2,
    },
    clickBehavior: {
      enabled: true,
      finishOnDoubleClick: true,
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "polygon",
    name: "Polygon",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.POLYGON ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.POLYGON,
      color: "#0000ff", // fill color (blue)
      strokeColor: "#cf5b5b", // border color (reddish pink)
      opacity: 0.5,
      borderWidth: 1,
    },
    clickBehavior: {
      enabled: true,
      finishOnDoubleClick: true,
      defaultSize: { width: 140, height: 100 },
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "text",
    name: "Text",
    interaction: {
      exclusive: true,
      cursor: "text",
      isRotatable: false,
    },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.FREETEXT ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.FREETEXT,
      textColor: "#111111",
      fontSize: 14,
      fontFamily: "Helvetica",
      opacity: 1,
      interiorColor: "#fffef7",
      contents: "Text",
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "note",
    name: "Note",
    interaction: {
      exclusive: true,
      cursor: "pointer",
      isRotatable: false,
    },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.FREETEXT ? 8 : 0,
    defaults: {
      type: PdfAnnotationSubtype.FREETEXT,
      textColor: "#1b1b1b",
      color: "#ffa000",
      interiorColor: "#fff8e1",
      opacity: 1,
      contents: "Note",
      fontSize: 12,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 160, height: 100 },
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "stamp",
    name: "Image Stamp",
    interaction: { exclusive: false, cursor: "copy" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.STAMP ? 5 : 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
    },
    behavior: {
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  ensureTool({
    id: "signatureStamp",
    name: "Digital Signature",
    interaction: { exclusive: false, cursor: "copy" },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
    },
  });

  ensureTool({
    id: "signatureInk",
    name: "Signature Draw",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.INK,
      strokeColor: "#000000",
      color: "#000000",
      opacity: 1.0,
      borderWidth: 2,
    },
  });
}
