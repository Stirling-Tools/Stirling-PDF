const EMPTY_ALPHA = 8;
const PAPER_LEVEL = 235;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = createCanvas(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
  );
  canvas.getContext("2d")?.drawImage(img, 0, 0);
  return canvas;
}

interface InkBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TrimOptions {
  treatPaperAsEmpty?: boolean;
  padding?: number;
  minInkPerLine?: number;
}

function inkSpan(counts: Uint32Array, min: number): [number, number] | null {
  let start = -1;
  let end = -1;
  counts.forEach((count, index) => {
    if (count < min) return;
    if (start < 0) start = index;
    end = index;
  });
  return start < 0 ? null : [start, end];
}

function findInkBounds(
  canvas: HTMLCanvasElement,
  { treatPaperAsEmpty = false, minInkPerLine = 1 }: TrimOptions,
): InkBounds | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const isInk = (i: number) =>
    pixels[i + 3] > EMPTY_ALPHA &&
    !(
      treatPaperAsEmpty &&
      pixels[i] > PAPER_LEVEL &&
      pixels[i + 1] > PAPER_LEVEL &&
      pixels[i + 2] > PAPER_LEVEL
    );
  const rows = new Uint32Array(height);
  const columns = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInk((y * width + x) * 4)) continue;
      rows[y]++;
      columns[x]++;
    }
  }
  const vertical = inkSpan(rows, minInkPerLine);
  const horizontal = inkSpan(columns, minInkPerLine);
  if (!vertical || !horizontal) return null;
  return {
    top: vertical[0],
    bottom: vertical[1],
    left: horizontal[0],
    right: horizontal[1],
  };
}

export function trimCanvas(
  source: HTMLCanvasElement,
  options: TrimOptions = {},
): HTMLCanvasElement {
  const bounds = findInkBounds(source, options);
  if (!bounds) return source;
  const padding = options.padding ?? 0;
  const left = Math.max(0, bounds.left - padding);
  const top = Math.max(0, bounds.top - padding);
  const width = Math.min(source.width, bounds.right + padding + 1) - left;
  const height = Math.min(source.height, bounds.bottom + padding + 1) - top;
  const out = createCanvas(width, height);
  out
    .getContext("2d")
    ?.drawImage(source, left, top, width, height, 0, 0, width, height);
  return out;
}

export function scaleCanvasToFit(
  source: HTMLCanvasElement,
  maxSide: number,
): HTMLCanvasElement {
  const scale = maxSide / Math.max(source.width, source.height);
  if (scale >= 1) return source;
  const out = createCanvas(source.width * scale, source.height * scale);
  out.getContext("2d")?.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

export function rotateCanvas(
  source: HTMLCanvasElement,
  quarterTurns: number,
): HTMLCanvasElement {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return source;
  const sideways = turns % 2 === 1;
  const out = createCanvas(
    sideways ? source.height : source.width,
    sideways ? source.width : source.height,
  );
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

export function recolorCanvas(canvas: HTMLCanvasElement, color: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
}
