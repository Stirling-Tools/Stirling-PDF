import { useImperativeHandle, forwardRef, useCallback } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, PdfAnnotationIcon } from '@embedpdf/models';
import type {
  AnnotationToolId,
  AnnotationToolOptions,
  AnnotationAPI,
  AnnotationEvent,
  AnnotationPatch,
} from '@app/components/viewer/viewerTypes';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

type NoteIcon = NonNullable<AnnotationToolOptions['icon']>;

type AnnotationDefaults =
  | {
      type:
        | PdfAnnotationSubtype.HIGHLIGHT
        | PdfAnnotationSubtype.UNDERLINE
        | PdfAnnotationSubtype.STRIKEOUT
        | PdfAnnotationSubtype.SQUIGGLY;
      strokeColor: string;
      color?: string;
      opacity: number;
      customData?: Record<string, unknown>;
    }
  | {
      type: PdfAnnotationSubtype.INK;
      strokeColor: string;
      color?: string;
      opacity?: number;
      borderWidth?: number;
      strokeWidth?: number;
      lineWidth?: number;
      customData?: Record<string, unknown>;
    }
  | {
      type: PdfAnnotationSubtype.FREETEXT;
      fontColor?: string;
      fontSize?: number;
      fontFamily?: string;
      textAlign?: number;
      opacity?: number;
      color?: string;
      interiorColor?: string;
      borderWidth?: number;
      contents?: string;
      icon?: PdfAnnotationIcon;
      customData?: Record<string, unknown>;
    }
  | {
      type: PdfAnnotationSubtype.SQUARE | PdfAnnotationSubtype.CIRCLE | PdfAnnotationSubtype.POLYGON;
      color: string;
      strokeColor: string;
      opacity: number;
      fillOpacity: number;
      strokeOpacity: number;
      borderWidth: number;
      strokeWidth: number;
      lineWidth: number;
      customData?: Record<string, unknown>;
    }
  | {
      type: PdfAnnotationSubtype.LINE | PdfAnnotationSubtype.POLYLINE;
      color: string;
      strokeColor?: string;
      opacity: number;
      borderWidth?: number;
      strokeWidth?: number;
      lineWidth?: number;
      startStyle?: string;
      endStyle?: string;
      lineEndingStyles?: { start: string; end: string };
      customData?: Record<string, unknown>;
    }
  | {
      type: PdfAnnotationSubtype.STAMP;
      imageSrc?: string;
      imageSize?: { width: number; height: number };
      customData?: Record<string, unknown>;
    }
  | null;

type AnnotationApiSurface = {
  setActiveTool: (toolId: AnnotationToolId | null) => void;
  getActiveTool?: () => { id: AnnotationToolId } | null;
  setToolDefaults?: (toolId: AnnotationToolId, defaults: AnnotationDefaults) => void;
  getSelectedAnnotation?: () => unknown | null;
  deselectAnnotation?: () => void;
  updateAnnotation?: (pageIndex: number, annotationId: string, patch: AnnotationPatch) => void;
  onAnnotationEvent?: (listener: (event: AnnotationEvent) => void) => void | (() => void);
  purgeAnnotation?: (pageIndex: number, annotationId: string) => void;
};

type ToolDefaultsBuilder = (options?: AnnotationToolOptions) => AnnotationDefaults;

const NOTE_ICON_MAP: Record<NoteIcon, PdfAnnotationIcon> = {
  Comment: PdfAnnotationIcon.Comment,
  Key: PdfAnnotationIcon.Key,
  Note: PdfAnnotationIcon.Note,
  Help: PdfAnnotationIcon.Help,
  NewParagraph: PdfAnnotationIcon.NewParagraph,
  Paragraph: PdfAnnotationIcon.Paragraph,
  Insert: PdfAnnotationIcon.Insert,
};

const DEFAULTS = {
  highlight: '#ffd54f',
  underline: '#ffb300',
  strikeout: '#e53935',
  squiggly: '#00acc1',
  ink: '#1f2933',
  inkHighlighter: '#ffd54f',
  text: '#111111',
  note: '#ffd54f',
  shapeFill: '#0000ff',
  shapeStroke: '#cf5b5b',
  shapeOpacity: 0.5,
};

const withCustomData = (options?: AnnotationToolOptions) =>
  options?.customData ? { customData: options.customData } : {};

const getIconEnum = (icon?: NoteIcon) => NOTE_ICON_MAP[icon ?? 'Comment'] ?? PdfAnnotationIcon.Comment;

const buildStampDefaults: ToolDefaultsBuilder = (options) => ({
  type: PdfAnnotationSubtype.STAMP,
  ...(options?.imageSrc ? { imageSrc: options.imageSrc } : {}),
  ...(options?.imageSize ? { imageSize: options.imageSize } : {}),
  ...withCustomData(options),
});

const buildInkDefaults = (options?: AnnotationToolOptions, opacityOverride?: number): AnnotationDefaults => {
  const colorValue = options?.color ?? (opacityOverride ? DEFAULTS.inkHighlighter : DEFAULTS.ink);
  return {
    type: PdfAnnotationSubtype.INK,
    strokeColor: colorValue,
    color: colorValue,
    opacity: options?.opacity ?? opacityOverride ?? 1,
    borderWidth: options?.thickness ?? (opacityOverride ? 6 : 2),
    strokeWidth: options?.thickness ?? (opacityOverride ? 6 : 2),
    lineWidth: options?.thickness ?? (opacityOverride ? 6 : 2),
    ...withCustomData(options),
  };
};

const TOOL_DEFAULT_BUILDERS: Record<AnnotationToolId, ToolDefaultsBuilder> = {
  select: () => null,
  highlight: (options) => {
    const colorValue = options?.color ?? DEFAULTS.highlight;
    return {
      type: PdfAnnotationSubtype.HIGHLIGHT,
      strokeColor: colorValue,
      color: colorValue,
      opacity: options?.opacity ?? 0.6,
      ...withCustomData(options),
    };
  },
  underline: (options) => {
    const colorValue = options?.color ?? DEFAULTS.underline;
    return {
      type: PdfAnnotationSubtype.UNDERLINE,
      strokeColor: colorValue,
      color: colorValue,
      opacity: options?.opacity ?? 1,
      ...withCustomData(options),
    };
  },
  strikeout: (options) => {
    const colorValue = options?.color ?? DEFAULTS.strikeout;
    return {
      type: PdfAnnotationSubtype.STRIKEOUT,
      strokeColor: colorValue,
      color: colorValue,
      opacity: options?.opacity ?? 1,
      ...withCustomData(options),
    };
  },
  squiggly: (options) => {
    const colorValue = options?.color ?? DEFAULTS.squiggly;
    return {
      type: PdfAnnotationSubtype.SQUIGGLY,
      strokeColor: colorValue,
      color: colorValue,
      opacity: options?.opacity ?? 1,
      ...withCustomData(options),
    };
  },
  ink: (options) => buildInkDefaults(options),
  inkHighlighter: (options) => buildInkDefaults(options, options?.opacity ?? 0.6),
  text: (options) => ({
    type: PdfAnnotationSubtype.FREETEXT,
    fontColor: options?.color ?? DEFAULTS.text,
    fontSize: options?.fontSize ?? 14,
    fontFamily: options?.fontFamily ?? 'Helvetica',
    textAlign: options?.textAlign ?? 0,
    opacity: options?.opacity ?? 1,
    borderWidth: options?.thickness ?? 1,
    ...(options?.fillColor ? { color: options.fillColor, interiorColor: options.fillColor } : {}),
    ...withCustomData(options),
  }),
  note: (options) => {
    const bgColor = options?.fillColor ?? DEFAULTS.note;
    const fontColor = options?.color ?? DEFAULTS.text;
    return {
      type: PdfAnnotationSubtype.FREETEXT,
      fontColor,
      fontFamily: options?.fontFamily ?? 'Helvetica',
      textAlign: options?.textAlign ?? 0,
      fontSize: options?.fontSize ?? 12,
      opacity: options?.opacity ?? 1,
      color: bgColor,
      interiorColor: bgColor,
      borderWidth: options?.thickness ?? 0,
      contents: options?.contents ?? 'Note',
      icon: getIconEnum(options?.icon),
      ...withCustomData(options),
    };
  },
  square: (options) => ({
    type: PdfAnnotationSubtype.SQUARE,
    color: options?.color ?? DEFAULTS.shapeFill,
    strokeColor: options?.strokeColor ?? DEFAULTS.shapeStroke,
    opacity: options?.opacity ?? DEFAULTS.shapeOpacity,
    fillOpacity: options?.fillOpacity ?? DEFAULTS.shapeOpacity,
    strokeOpacity: options?.strokeOpacity ?? DEFAULTS.shapeOpacity,
    borderWidth: options?.borderWidth ?? 1,
    strokeWidth: options?.borderWidth ?? 1,
    lineWidth: options?.borderWidth ?? 1,
    ...withCustomData(options),
  }),
  circle: (options) => ({
    type: PdfAnnotationSubtype.CIRCLE,
    color: options?.color ?? DEFAULTS.shapeFill,
    strokeColor: options?.strokeColor ?? DEFAULTS.shapeStroke,
    opacity: options?.opacity ?? DEFAULTS.shapeOpacity,
    fillOpacity: options?.fillOpacity ?? DEFAULTS.shapeOpacity,
    strokeOpacity: options?.strokeOpacity ?? DEFAULTS.shapeOpacity,
    borderWidth: options?.borderWidth ?? 1,
    strokeWidth: options?.borderWidth ?? 1,
    lineWidth: options?.borderWidth ?? 1,
    ...withCustomData(options),
  }),
  line: (options) => ({
    type: PdfAnnotationSubtype.LINE,
    color: options?.color ?? '#1565c0',
    strokeColor: options?.color ?? '#1565c0',
    opacity: options?.opacity ?? 1,
    borderWidth: options?.borderWidth ?? 2,
    strokeWidth: options?.borderWidth ?? 2,
    lineWidth: options?.borderWidth ?? 2,
    ...withCustomData(options),
  }),
  lineArrow: (options) => ({
    type: PdfAnnotationSubtype.LINE,
    color: options?.color ?? '#1565c0',
    strokeColor: options?.color ?? '#1565c0',
    opacity: options?.opacity ?? 1,
    borderWidth: options?.borderWidth ?? 2,
    strokeWidth: options?.borderWidth ?? 2,
    lineWidth: options?.borderWidth ?? 2,
    startStyle: 'None',
    endStyle: 'ClosedArrow',
    lineEndingStyles: { start: 'None', end: 'ClosedArrow' },
    ...withCustomData(options),
  }),
  polyline: (options) => ({
    type: PdfAnnotationSubtype.POLYLINE,
    color: options?.color ?? '#1565c0',
    opacity: options?.opacity ?? 1,
    borderWidth: options?.borderWidth ?? 2,
    ...withCustomData(options),
  }),
  polygon: (options) => ({
    type: PdfAnnotationSubtype.POLYGON,
    color: options?.color ?? DEFAULTS.shapeFill,
    strokeColor: options?.strokeColor ?? DEFAULTS.shapeStroke,
    opacity: options?.opacity ?? DEFAULTS.shapeOpacity,
    fillOpacity: options?.fillOpacity ?? DEFAULTS.shapeOpacity,
    strokeOpacity: options?.strokeOpacity ?? DEFAULTS.shapeOpacity,
    borderWidth: options?.borderWidth ?? 1,
    strokeWidth: options?.borderWidth ?? 1,
    lineWidth: options?.borderWidth ?? 1,
    ...withCustomData(options),
  }),
  stamp: buildStampDefaults,
  signatureStamp: buildStampDefaults,
  signatureInk: (options) => buildInkDefaults(options),
};

export const AnnotationAPIBridge = forwardRef<AnnotationAPI>(function AnnotationAPIBridge(_props, ref) {
  // Use the provided annotation API just like SignatureAPIBridge/HistoryAPIBridge
  const { provides: annotationApi } = useAnnotationCapability();
  const documentReady = useDocumentReady();

  const buildAnnotationDefaults = useCallback(
    (toolId: AnnotationToolId, options?: AnnotationToolOptions) =>
      TOOL_DEFAULT_BUILDERS[toolId]?.(options) ?? null,
    []
  );

  const configureAnnotationTool = useCallback(
    (toolId: AnnotationToolId, options?: AnnotationToolOptions) => {
      const api = annotationApi as AnnotationApiSurface | undefined;
      if (!api?.setActiveTool) return;

      const defaults = buildAnnotationDefaults(toolId, options);

      // Reset tool first, then activate (like SignatureAPIBridge does)
      api.setActiveTool(null);
      api.setActiveTool(toolId === 'select' ? null : toolId);

      // Verify tool was activated before setting defaults (like SignatureAPIBridge does)
      const activeTool = api.getActiveTool?.();
      if (activeTool && activeTool.id === toolId && defaults) {
        api.setToolDefaults?.(toolId, defaults);
      }
    },
    [annotationApi, buildAnnotationDefaults]
  );

  useImperativeHandle(
    ref,
    () => ({
      activateAnnotationTool: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => {
        configureAnnotationTool(toolId, options);
      },
      isReady: () => !!annotationApi && documentReady,
      setAnnotationStyle: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => {
        const defaults = buildAnnotationDefaults(toolId, options);
        const api = annotationApi as AnnotationApiSurface | undefined;
        if (defaults && api?.setToolDefaults) {
          api.setToolDefaults(toolId, defaults);
        }
      },
      getSelectedAnnotation: () => {
        const api = annotationApi as AnnotationApiSurface | undefined;
        if (!api?.getSelectedAnnotation) {
          return null;
        }
        try {
          return api.getSelectedAnnotation();
        } catch (error) {
          // Some EmbedPDF builds expose getSelectedAnnotation with an internal
          // `this`/state dependency (e.g. reading `selectedUid` from undefined).
          // If that happens, fail gracefully and treat it as "no selection"
          // instead of crashing the entire annotations tool.
          // Only log unexpected errors - "No active document" is a common expected state during init
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('No active document')) {
            console.error('[AnnotationAPIBridge] getSelectedAnnotation failed:', error);
          }
          return null;
        }
      },
      deselectAnnotation: () => {
        const api = annotationApi as AnnotationApiSurface | undefined;
        api?.deselectAnnotation?.();
      },
      updateAnnotation: (pageIndex: number, annotationId: string, patch: AnnotationPatch) => {
        const api = annotationApi as AnnotationApiSurface | undefined;
        api?.updateAnnotation?.(pageIndex, annotationId, patch);
      },
      deactivateTools: () => {
        const api = annotationApi as AnnotationApiSurface | undefined;
        api?.setActiveTool?.(null);
      },
      onAnnotationEvent: (listener: (event: AnnotationEvent) => void) => {
        const api = annotationApi as AnnotationApiSurface | undefined;
        if (api?.onAnnotationEvent) {
          return api.onAnnotationEvent(listener);
        }
        return undefined;
      },
      getActiveTool: () => {
        const api = annotationApi as AnnotationApiSurface | undefined;
        return api?.getActiveTool?.() ?? null;
      },

      purgeAnnotation: (pageIndex: number, annotationId: string) => {
        const api = annotationApi as AnnotationApiSurface | undefined;
        api?.purgeAnnotation?.(pageIndex, annotationId);
      },
    }),
    [annotationApi, configureAnnotationTool, buildAnnotationDefaults]
  );

  return null;
});
