import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import SignaturePad from "signature_pad";
import { trimCanvas } from "@app/utils/canvasImage";
import { SIGNATURE_TRIM_PADDING } from "@app/utils/signatureImage";

export type PenWidth = "fine" | "medium" | "bold";

export const PEN_WIDTHS: Record<PenWidth, { min: number; max: number }> = {
  fine: { min: 0.6, max: 1.8 },
  medium: { min: 1, max: 3 },
  bold: { min: 1.8, max: 4.8 },
};

const MIN_PIXEL_RATIO = 2;

function fitCanvasToLayout(canvas: HTMLCanvasElement, pad: SignaturePad) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const ratio = Math.max(window.devicePixelRatio || 1, MIN_PIXEL_RATIO);
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width === width && canvas.height === height) return;
  const strokes = pad.toData();
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.scale(ratio, ratio);
  pad.fromData(strokes);
}

function restyle(pad: SignaturePad, ink: string, pen: PenWidth) {
  const { min, max } = PEN_WIDTHS[pen];
  pad.penColor = ink;
  pad.minWidth = min;
  pad.maxWidth = max;
  pad.fromData(
    pad.toData().map((group) => ({
      ...group,
      penColor: ink,
      minWidth: min,
      maxWidth: max,
    })),
  );
}

export function useSignaturePad(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  ink: string,
  pen: PenWidth,
) {
  const padRef = useRef<SignaturePad | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);

  const syncStrokeCount = useCallback(() => {
    setStrokeCount(padRef.current?.toData().length ?? 0);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { throttle: 8, minDistance: 2 });
    padRef.current = pad;
    pad.addEventListener("endStroke", syncStrokeCount);
    fitCanvasToLayout(canvas, pad);
    const observer = new ResizeObserver(() => fitCanvasToLayout(canvas, pad));
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      pad.removeEventListener("endStroke", syncStrokeCount);
      pad.off();
      padRef.current = null;
    };
  }, [canvasRef, syncStrokeCount]);

  useEffect(() => {
    if (padRef.current) restyle(padRef.current, ink, pen);
  }, [ink, pen]);

  const undo = useCallback(() => {
    const pad = padRef.current;
    if (!pad) return;
    pad.fromData(pad.toData().slice(0, -1));
    syncStrokeCount();
  }, [syncStrokeCount]);

  const clear = useCallback(() => {
    padRef.current?.clear();
    syncStrokeCount();
  }, [syncStrokeCount]);

  const toTrimmedDataUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !padRef.current || padRef.current.isEmpty()) return null;
    return trimCanvas(canvas, { padding: SIGNATURE_TRIM_PADDING }).toDataURL(
      "image/png",
    );
  }, [canvasRef]);

  return { strokeCount, undo, clear, toTrimmedDataUrl };
}
