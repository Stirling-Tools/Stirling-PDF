import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  useSignatureFieldPicker,
  type StampGuideRect,
} from "@editor/contexts/SignatureFieldPickerContext";
import { isStirlingFile } from "@editor/types/fileContext";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";
import "@editor/components/viewer/StampGuideLayer.css";

interface StampGuideLayerProps {
  pageIndex: number;
  pdfSource: File | Blob | null;
  pageWidth: number;
  pageHeight: number;
}

interface Point {
  x: number;
  y: number;
}

type Drag =
  | { mode: "move"; grab: Point; start: StampGuideRect }
  | { mode: "resize"; start: StampGuideRect };

const MIN_WIDTH = 40;
const MIN_HEIGHT = 16;

function clampRect(
  rect: StampGuideRect,
  page: { width: number; height: number },
): StampGuideRect {
  const width = Math.min(Math.max(rect.width, MIN_WIDTH), page.width);
  const height = Math.min(Math.max(rect.height, MIN_HEIGHT), page.height);
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 0), page.width - width),
    y: Math.min(Math.max(rect.y, 0), page.height - height),
  };
}

/** Where the signature box goes on one page: click to place it, drag to move, drag the corner to resize. */
export function StampGuideLayer({
  pageIndex,
  pdfSource,
  pageWidth,
  pageHeight,
}: StampGuideLayerProps) {
  const { t } = useTranslation();
  const { guide } = useSignatureFieldPicker();
  const [hover, setHover] = useState<Point | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const { provides: interactionManager } = useInteractionManagerCapability();
  const placingHere = !!guide?.placing;
  const busy = drag !== null || placingHere;

  // The viewer's own text selection listens on the page before React sees the event, so it is
  // paused while the guide is being placed or dragged.
  useEffect(() => {
    if (!busy) return;
    interactionManager?.pause();
    return () => interactionManager?.resume();
  }, [busy, interactionManager]);

  useEffect(() => {
    if (!drag) return;
    const end = () => setDrag(null);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [drag]);

  const fileId =
    pdfSource && isStirlingFile(pdfSource) ? pdfSource.fileId : null;
  const page = guide?.pageSizes[pageIndex];
  if (!guide || guide.fileId !== fileId || !page) return null;

  const scaleX = pageWidth / page.width;
  const scaleY = pageHeight / page.height;
  const toPoints = (event: MouseEvent<HTMLElement>): Point => ({
    x: event.nativeEvent.offsetX / scaleX,
    y: event.nativeEvent.offsetY / scaleY,
  });
  const centredAt = (point: Point): StampGuideRect =>
    clampRect(
      {
        ...guide.defaultSize,
        x: point.x - guide.defaultSize.width / 2,
        y: point.y - guide.defaultSize.height / 2,
      },
      page,
    );
  const toStyle = (rect: StampGuideRect) => ({
    left: rect.x * scaleX,
    top: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  });

  const onSurfaceMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = toPoints(event);
    if (!drag) {
      setHover(point);
      return;
    }
    const next =
      drag.mode === "move"
        ? {
            ...drag.start,
            x: point.x - drag.grab.x,
            y: point.y - drag.grab.y,
          }
        : {
            ...drag.start,
            width: point.x - drag.start.x,
            height: point.y - drag.start.y,
          };
    guide.onChange(pageIndex, clampRect(next, page));
  };

  const startDrag = (
    event: PointerEvent<HTMLElement>,
    mode: Drag["mode"],
    rect: StampGuideRect,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    interactionManager?.pause();
    setDrag(
      mode === "move"
        ? {
            mode,
            grab: {
              x: event.nativeEvent.offsetX / scaleX,
              y: event.nativeEvent.offsetY / scaleY,
            },
            start: rect,
          }
        : { mode, start: rect },
    );
  };

  const placedHere =
    !guide.placing && guide.pageIndex === pageIndex && guide.rect;
  const showSurface = guide.placing || (drag !== null && placedHere);

  return (
    <div className="stamp-guide-layer" data-stamp-guide-page={pageIndex}>
      {placedHere && guide.rect && (
        <div
          className="stamp-guide-box"
          style={toStyle(guide.rect)}
          onPointerDown={(event) => startDrag(event, "move", guide.rect!)}
          aria-label={t(
            "certSign.appearance.placement.guide",
            "Signature position: drag to move, drag the corner to resize",
          )}
          role="img"
        >
          {guide.preview && (
            <img src={guide.preview} alt="" draggable={false} />
          )}
          <span
            className="stamp-guide-handle"
            onPointerDown={(event) => startDrag(event, "resize", guide.rect!)}
          />
        </div>
      )}
      {showSurface && (
        <div
          className={`stamp-guide-surface${guide.placing ? " stamp-guide-surface--placing" : ""}`}
          onPointerMove={onSurfaceMove}
          onPointerLeave={() => setHover(null)}
          onClick={(event) => {
            if (!guide.placing) return;
            guide.onChange(pageIndex, centredAt(toPoints(event)));
          }}
        >
          {guide.placing && hover && guide.preview && (
            <div
              className="stamp-guide-box stamp-guide-box--ghost"
              style={toStyle(centredAt(hover))}
            >
              <img src={guide.preview} alt="" draggable={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
