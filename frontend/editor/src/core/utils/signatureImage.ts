import { removeWhiteBackground } from "@app/utils/imageTransparency";
import {
  createCanvas,
  imageToCanvas,
  loadImage,
  recolorCanvas,
  rotateCanvas,
  scaleCanvasToFit,
  trimCanvas,
} from "@app/utils/canvasImage";

export const SIGNATURE_TRIM_PADDING = 6;
const MAX_UPLOAD_SIDE = 1200;
const PHOTO_SPECK_PIXELS = 3;
const PLACED_MAX_WIDTH = 180;
const PLACED_MAX_HEIGHT = 60;

export interface TypedSignatureOptions {
  text: string;
  fontFamily: string;
  color: string;
  fontSize: number;
}

export async function renderTypedSignature({
  text,
  fontFamily,
  color,
  fontSize,
}: TypedSignatureOptions): Promise<string | null> {
  const value = text.trim();
  if (!value) return null;
  const font = `${fontSize}px "${fontFamily}"`;
  await document.fonts?.load(font, value).catch(() => undefined);

  const ctx = createCanvas(1, 1).getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  const metrics = ctx.measureText(value);
  const left = Math.ceil(metrics.actualBoundingBoxLeft || 0);
  const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontSize * 0.3);
  const pad = Math.round(fontSize * 0.12);

  const canvas = createCanvas(
    left + right + pad * 2,
    ascent + descent + pad * 2,
  );
  const out = canvas.getContext("2d");
  if (!out) return null;
  out.font = font;
  out.fillStyle = color;
  out.fillText(value, pad + left, pad + ascent);
  return canvas.toDataURL("image/png");
}

export interface UploadCleanup {
  removeBackground: boolean;
  trim: boolean;
  inkColor: string | null;
  quarterTurns: number;
}

async function removePaper(source: string): Promise<HTMLCanvasElement> {
  const transparent = await removeWhiteBackground(source, {
    autoDetectCorner: true,
    tolerance: 15,
  });
  return imageToCanvas(await loadImage(transparent));
}

export const PHONE_DRAWING_CLEANUP: UploadCleanup = {
  removeBackground: false,
  trim: true,
  inkColor: null,
  quarterTurns: 0,
};

export async function cleanUpSignatureImage(
  source: string,
  { removeBackground, trim, inkColor, quarterTurns }: UploadCleanup,
): Promise<string> {
  const photo = scaleCanvasToFit(
    imageToCanvas(await loadImage(source)),
    MAX_UPLOAD_SIDE,
  );
  const base = removeBackground
    ? await removePaper(photo.toDataURL("image/png"))
    : photo;
  let canvas = rotateCanvas(base, quarterTurns);
  if (trim) {
    canvas = trimCanvas(canvas, {
      treatPaperAsEmpty: !removeBackground,
      padding: SIGNATURE_TRIM_PADDING,
      minInkPerLine: PHOTO_SPECK_PIXELS,
    });
  }
  if (removeBackground && inkColor) {
    recolorCanvas(canvas, inkColor);
  }
  return canvas.toDataURL("image/png");
}

export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${words[0].charAt(0)}${last}`.toUpperCase();
}

export function fitPlacedSignatureSize(width: number, height: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(
    PLACED_MAX_WIDTH / safeWidth,
    PLACED_MAX_HEIGHT / safeHeight,
  );
  return { width: safeWidth * scale, height: safeHeight * scale };
}
