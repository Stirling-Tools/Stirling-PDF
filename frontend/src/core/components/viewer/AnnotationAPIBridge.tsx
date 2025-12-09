import { useImperativeHandle, forwardRef, useCallback } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, PdfAnnotationIcon } from '@embedpdf/models';
import type { AnnotationToolId, AnnotationToolOptions, AnnotationAPI } from '@app/components/viewer/viewerTypes';

export const AnnotationAPIBridge = forwardRef<AnnotationAPI>(function AnnotationAPIBridge(_props, ref) {
  const annotationApi = useAnnotationCapability();

  const getIconEnum = (icon?: string): PdfAnnotationIcon => {
    switch (icon) {
      case 'Comment': return PdfAnnotationIcon.Comment;
      case 'Key': return PdfAnnotationIcon.Key;
      case 'Note': return PdfAnnotationIcon.Note;
      case 'Help': return PdfAnnotationIcon.Help;
      case 'NewParagraph': return PdfAnnotationIcon.NewParagraph;
      case 'Paragraph': return PdfAnnotationIcon.Paragraph;
      case 'Insert': return PdfAnnotationIcon.Insert;
      default: return PdfAnnotationIcon.Comment;
    }
  };

  const buildAnnotationDefaults = useCallback(
    (toolId: AnnotationToolId, options?: AnnotationToolOptions) => {
      switch (toolId) {
        case 'highlight':
          return {
            type: PdfAnnotationSubtype.HIGHLIGHT,
            color: options?.color ?? '#ffd54f',
            opacity: options?.opacity ?? 0.6,
          };
        case 'underline':
          return {
            type: PdfAnnotationSubtype.UNDERLINE,
            color: options?.color ?? '#ffb300',
            opacity: options?.opacity ?? 1,
          };
        case 'strikeout':
          return {
            type: PdfAnnotationSubtype.STRIKEOUT,
            color: options?.color ?? '#e53935',
            opacity: options?.opacity ?? 1,
          };
        case 'squiggly':
          return {
            type: PdfAnnotationSubtype.SQUIGGLY,
            color: options?.color ?? '#00acc1',
            opacity: options?.opacity ?? 1,
          };
        case 'ink':
          return {
            type: PdfAnnotationSubtype.INK,
            color: options?.color ?? '#1f2933',
            borderWidth: options?.thickness ?? 2,
            strokeWidth: options?.thickness ?? 2,
            lineWidth: options?.thickness ?? 2,
          };
        case 'inkHighlighter':
          return {
            type: PdfAnnotationSubtype.INK,
            color: options?.color ?? '#ffd54f',
            opacity: options?.opacity ?? 0.6,
            borderWidth: options?.thickness ?? 6,
            strokeWidth: options?.thickness ?? 6,
            lineWidth: options?.thickness ?? 6,
          };
        case 'text':
          return {
            type: PdfAnnotationSubtype.FREETEXT,
            textColor: options?.color ?? '#111111',
            fontSize: options?.fontSize ?? 14,
            fontFamily: options?.fontFamily ?? 'Helvetica',
            opacity: options?.opacity ?? 1,
            interiorColor: options?.fillColor ?? '#fffef7',
            borderWidth: options?.thickness ?? 1,
          };
        case 'note':
          return {
            type: PdfAnnotationSubtype.TEXT,
            color: options?.color ?? '#ffa000',
            opacity: options?.opacity ?? 1,
            icon: getIconEnum(options?.icon),
            contents: options?.contents ?? '',
          };
        case 'square':
          return {
            type: PdfAnnotationSubtype.SQUARE,
            color: options?.color ?? '#0000ff',
            strokeColor: options?.strokeColor ?? '#cf5b5b',
            opacity: options?.opacity ?? 0.5,
            fillOpacity: options?.fillOpacity ?? 0.5,
            strokeOpacity: options?.strokeOpacity ?? 0.5,
            borderWidth: options?.borderWidth ?? 1,
            strokeWidth: options?.borderWidth ?? 1,
            lineWidth: options?.borderWidth ?? 1,
          };
        case 'circle':
          return {
            type: PdfAnnotationSubtype.CIRCLE,
            color: options?.color ?? '#0000ff',
            strokeColor: options?.strokeColor ?? '#cf5b5b',
            opacity: options?.opacity ?? 0.5,
            fillOpacity: options?.fillOpacity ?? 0.5,
            strokeOpacity: options?.strokeOpacity ?? 0.5,
            borderWidth: options?.borderWidth ?? 1,
            strokeWidth: options?.borderWidth ?? 1,
            lineWidth: options?.borderWidth ?? 1,
          };
        case 'line':
          return {
            type: PdfAnnotationSubtype.LINE,
            color: options?.color ?? '#1565c0',
            strokeColor: options?.color ?? '#1565c0',
            opacity: options?.opacity ?? 1,
            borderWidth: options?.borderWidth ?? 2,
            strokeWidth: options?.borderWidth ?? 2,
            lineWidth: options?.borderWidth ?? 2,
          };
        case 'lineArrow':
          return {
            type: PdfAnnotationSubtype.LINE,
            color: options?.color ?? '#1565c0',
            strokeColor: options?.color ?? '#1565c0',
            opacity: options?.opacity ?? 1,
            borderWidth: options?.borderWidth ?? 2,
            startStyle: 'None',
            endStyle: 'ClosedArrow',
            lineEndingStyles: { start: 'None', end: 'ClosedArrow' },
          };
        case 'polyline':
          return {
            type: PdfAnnotationSubtype.POLYLINE,
            color: options?.color ?? '#1565c0',
            opacity: options?.opacity ?? 1,
            borderWidth: options?.borderWidth ?? 2,
          };
        case 'polygon':
          return {
            type: PdfAnnotationSubtype.POLYGON,
            color: options?.color ?? '#0000ff',
            strokeColor: options?.strokeColor ?? '#cf5b5b',
            opacity: options?.opacity ?? 0.5,
            fillOpacity: options?.fillOpacity ?? 0.5,
            strokeOpacity: options?.strokeOpacity ?? 0.5,
            borderWidth: options?.borderWidth ?? 1,
            strokeWidth: options?.borderWidth ?? 1,
            lineWidth: options?.borderWidth ?? 1,
          };
        case 'stamp':
          return {
            type: PdfAnnotationSubtype.STAMP,
          };
        case 'select':
        default:
          return null;
      }
    },
    []
  );

  const configureAnnotationTool = useCallback(
    (toolId: AnnotationToolId, options?: AnnotationToolOptions) => {
      if (!annotationApi) return;

      const defaults = buildAnnotationDefaults(toolId, options);
      const api = annotationApi as any;

      if (defaults) {
        api.setToolDefaults?.(toolId, defaults);
      }

      api.setActiveTool?.(toolId === 'select' ? null : toolId);
    },
    [annotationApi, buildAnnotationDefaults]
  );

  useImperativeHandle(ref, () => ({
    activateAnnotationTool: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => {
      configureAnnotationTool(toolId, options);
    },
    setAnnotationStyle: (toolId: AnnotationToolId, options?: AnnotationToolOptions) => {
      const defaults = buildAnnotationDefaults(toolId, options);
      const api = annotationApi as any;
      if (defaults && api?.setToolDefaults) {
        api.setToolDefaults(toolId, defaults);
      }
    },
    getSelectedAnnotation: () => {
      const api = annotationApi as any;
      return api?.getSelectedAnnotation?.() ?? null;
    },
    deselectAnnotation: () => {
      const api = annotationApi as any;
      api?.deselectAnnotation?.();
    },
    updateAnnotation: (pageIndex: number, annotationId: string, patch: Partial<any>) => {
      const api = annotationApi as any;
      api?.updateAnnotation?.(pageIndex, annotationId, patch);
    },
    deactivateTools: () => {
      if (!annotationApi) return;
      const api = annotationApi as any;
      api?.setActiveTool?.(null);
    },
  }), [annotationApi, configureAnnotationTool, buildAnnotationDefaults]);

  return null;
});
