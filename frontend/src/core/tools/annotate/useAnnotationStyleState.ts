import { useCallback, useMemo, useState } from 'react';
import type { AnnotationToolId } from '@app/components/viewer/viewerTypes';

type Size = { width: number; height: number };

export type BuildToolOptionsExtras = {
  includeMetadata?: boolean;
  stampImageData?: string;
  stampImageSize?: Size | null;
};

interface StyleState {
  inkColor: string;
  inkWidth: number;
  highlightColor: string;
  highlightOpacity: number;
  freehandHighlighterWidth: number;
  underlineColor: string;
  underlineOpacity: number;
  strikeoutColor: string;
  strikeoutOpacity: number;
  squigglyColor: string;
  squigglyOpacity: number;
  textColor: string;
  textSize: number;
  textAlignment: 'left' | 'center' | 'right';
  textBackgroundColor: string;
  noteBackgroundColor: string;
  shapeStrokeColor: string;
  shapeFillColor: string;
  shapeOpacity: number;
  shapeStrokeOpacity: number;
  shapeFillOpacity: number;
  shapeThickness: number;
}

interface StyleActions {
  setInkColor: (value: string) => void;
  setInkWidth: (value: number) => void;
  setHighlightColor: (value: string) => void;
  setHighlightOpacity: (value: number) => void;
  setFreehandHighlighterWidth: (value: number) => void;
  setUnderlineColor: (value: string) => void;
  setUnderlineOpacity: (value: number) => void;
  setStrikeoutColor: (value: string) => void;
  setStrikeoutOpacity: (value: number) => void;
  setSquigglyColor: (value: string) => void;
  setSquigglyOpacity: (value: number) => void;
  setTextColor: (value: string) => void;
  setTextSize: (value: number) => void;
  setTextAlignment: (value: 'left' | 'center' | 'right') => void;
  setTextBackgroundColor: (value: string) => void;
  setNoteBackgroundColor: (value: string) => void;
  setShapeStrokeColor: (value: string) => void;
  setShapeFillColor: (value: string) => void;
  setShapeOpacity: (value: number) => void;
  setShapeStrokeOpacity: (value: number) => void;
  setShapeFillOpacity: (value: number) => void;
  setShapeThickness: (value: number) => void;
}

export type BuildToolOptionsFn = (
  toolId: AnnotationToolId,
  extras?: BuildToolOptionsExtras
) => Record<string, unknown>;

export interface AnnotationStyleStateReturn {
  styleState: StyleState;
  styleActions: StyleActions;
  buildToolOptions: BuildToolOptionsFn;
  getActiveColor: (target: string | null) => string;
}

export const useAnnotationStyleState = (
  cssToPdfSize?: (size: Size) => Size
): AnnotationStyleStateReturn => {
  const [inkColor, setInkColor] = useState('#1f2933');
  const [inkWidth, setInkWidth] = useState(2);
  const [highlightColor, setHighlightColor] = useState('#ffd54f');
  const [highlightOpacity, setHighlightOpacity] = useState(60);
  const [freehandHighlighterWidth, setFreehandHighlighterWidth] = useState(6);
  const [underlineColor, setUnderlineColor] = useState('#ffb300');
  const [underlineOpacity, setUnderlineOpacity] = useState(100);
  const [strikeoutColor, setStrikeoutColor] = useState('#e53935');
  const [strikeoutOpacity, setStrikeoutOpacity] = useState(100);
  const [squigglyColor, setSquigglyColor] = useState('#00acc1');
  const [squigglyOpacity, setSquigglyOpacity] = useState(100);
  const [textColor, setTextColor] = useState('#111111');
  const [textSize, setTextSize] = useState(14);
  const [textAlignment, setTextAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [textBackgroundColor, setTextBackgroundColor] = useState<string>('');
  const [noteBackgroundColor, setNoteBackgroundColor] = useState('#ffd54f');
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#cf5b5b');
  const [shapeFillColor, setShapeFillColor] = useState('#0000ff');
  const [shapeOpacity, setShapeOpacity] = useState(50);
  const [shapeStrokeOpacity, setShapeStrokeOpacity] = useState(50);
  const [shapeFillOpacity, setShapeFillOpacity] = useState(50);
  const [shapeThickness, setShapeThickness] = useState(1);

  const buildToolOptions = useCallback<BuildToolOptionsFn>(
    (toolId, extras) => {
      const includeMetadata = extras?.includeMetadata ?? true;
      const metadata = includeMetadata
        ? {
            customData: {
              toolId,
              annotationToolId: toolId,
              source: 'annotate',
              author: 'User',
              createdAt: new Date().toISOString(),
              modifiedAt: new Date().toISOString(),
            },
          }
        : {};

      switch (toolId) {
        case 'ink':
          return { color: inkColor, thickness: inkWidth, ...metadata };
        case 'inkHighlighter':
          return {
            color: highlightColor,
            opacity: highlightOpacity / 100,
            thickness: freehandHighlighterWidth,
            ...metadata,
          };
        case 'highlight':
          return { color: highlightColor, opacity: highlightOpacity / 100, ...metadata };
        case 'underline':
          return { color: underlineColor, opacity: underlineOpacity / 100, ...metadata };
        case 'strikeout':
          return { color: strikeoutColor, opacity: strikeoutOpacity / 100, ...metadata };
        case 'squiggly':
          return { color: squigglyColor, opacity: squigglyOpacity / 100, ...metadata };
        case 'text': {
          const textAlignNumber = textAlignment === 'left' ? 0 : textAlignment === 'center' ? 1 : 2;
          return {
            color: textColor,
            fontSize: textSize,
            textAlign: textAlignNumber,
            ...(textBackgroundColor ? { fillColor: textBackgroundColor } : {}),
            ...metadata,
          };
        }
        case 'note': {
          const noteFillColor = noteBackgroundColor || 'transparent';
          return {
            color: textColor,
            fillColor: noteFillColor,
            opacity: 1,
            ...metadata,
          };
        }
        case 'square':
        case 'circle':
        case 'polygon':
          return {
            color: shapeFillColor,
            strokeColor: shapeStrokeColor,
            opacity: shapeOpacity / 100,
            strokeOpacity: shapeStrokeOpacity / 100,
            fillOpacity: shapeFillOpacity / 100,
            borderWidth: shapeThickness,
            ...metadata,
          };
        case 'line':
        case 'polyline':
        case 'lineArrow':
          return {
            color: shapeStrokeColor,
            strokeColor: shapeStrokeColor,
            opacity: shapeStrokeOpacity / 100,
            borderWidth: shapeThickness,
            ...metadata,
          };
        case 'stamp': {
          const pdfSize =
            extras?.stampImageSize && cssToPdfSize ? cssToPdfSize(extras.stampImageSize) : undefined;
          return {
            imageSrc: extras?.stampImageData,
            ...(pdfSize ? { imageSize: pdfSize } : {}),
            ...metadata,
          };
        }
        default:
          return { ...metadata };
      }
    },
    [
      cssToPdfSize,
      freehandHighlighterWidth,
      highlightColor,
      highlightOpacity,
      inkColor,
      inkWidth,
      noteBackgroundColor,
      shapeFillColor,
      shapeFillOpacity,
      shapeOpacity,
      shapeStrokeColor,
      shapeStrokeOpacity,
      shapeThickness,
      squigglyColor,
      squigglyOpacity,
      strikeoutColor,
      strikeoutOpacity,
      textAlignment,
      textBackgroundColor,
      textColor,
      textSize,
      underlineColor,
      underlineOpacity,
    ]
  );

  const getActiveColor = useCallback(
    (target: string | null) => {
      if (target === 'ink') return inkColor;
      if (target === 'highlight' || target === 'inkHighlighter') return highlightColor;
      if (target === 'underline') return underlineColor;
      if (target === 'strikeout') return strikeoutColor;
      if (target === 'squiggly') return squigglyColor;
      if (target === 'shapeStroke') return shapeStrokeColor;
      if (target === 'shapeFill') return shapeFillColor;
      if (target === 'textBackground') return textBackgroundColor || '#ffffff';
      if (target === 'noteBackground') return noteBackgroundColor || '#ffffff';
      return textColor;
    },
    [
      highlightColor,
      inkColor,
      noteBackgroundColor,
      shapeFillColor,
      shapeStrokeColor,
      squigglyColor,
      strikeoutColor,
      textBackgroundColor,
      textColor,
      underlineColor,
    ]
  );

  const styleState: StyleState = useMemo(
    () => ({
      inkColor,
      inkWidth,
      highlightColor,
      highlightOpacity,
      freehandHighlighterWidth,
      underlineColor,
      underlineOpacity,
      strikeoutColor,
      strikeoutOpacity,
      squigglyColor,
      squigglyOpacity,
      textColor,
      textSize,
      textAlignment,
      textBackgroundColor,
      noteBackgroundColor,
      shapeStrokeColor,
      shapeFillColor,
      shapeOpacity,
      shapeStrokeOpacity,
      shapeFillOpacity,
      shapeThickness,
    }),
    [
      freehandHighlighterWidth,
      highlightColor,
      highlightOpacity,
      inkColor,
      inkWidth,
      noteBackgroundColor,
      shapeFillColor,
      shapeFillOpacity,
      shapeOpacity,
      shapeStrokeColor,
      shapeStrokeOpacity,
      shapeThickness,
      squigglyColor,
      squigglyOpacity,
      strikeoutColor,
      strikeoutOpacity,
      textAlignment,
      textBackgroundColor,
      textColor,
      textSize,
      underlineColor,
      underlineOpacity,
    ]
  );

  const styleActions: StyleActions = {
    setInkColor,
    setInkWidth,
    setHighlightColor,
    setHighlightOpacity,
    setFreehandHighlighterWidth,
    setUnderlineColor,
    setUnderlineOpacity,
    setStrikeoutColor,
    setStrikeoutOpacity,
    setSquigglyColor,
    setSquigglyOpacity,
    setTextColor,
    setTextSize,
    setTextAlignment,
    setTextBackgroundColor,
    setNoteBackgroundColor,
    setShapeStrokeColor,
    setShapeFillColor,
    setShapeOpacity,
    setShapeStrokeOpacity,
    setShapeFillOpacity,
    setShapeThickness,
  };

  return {
    styleState,
    styleActions,
    buildToolOptions,
    getActiveColor,
  };
};
