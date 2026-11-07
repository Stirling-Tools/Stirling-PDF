import { readFile } from "node:fs/promises";
import path from "node:path";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  INK_SCALE,
  capturePatch,
} from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  base14SpaceAdvance,
  emitTextLine,
  measureObjSpanPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  opaqueStroke,
  spanOf,
} from "@editor/tools/pdfTextEditor/commands/scanStyle";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";
import { moveAllObjects } from "@editor/tools/pdfTextEditor/commands/scanFrame";
import { createBitmapImageObject } from "@editor/utils/pdfiumBitmapUtils";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  getLocalFontBytes,
  registerFontBytes,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { parseFontMetrics } from "@editor/tools/pdfTextEditor/util/fontMetrics";
import {
  BUNDLED_SCAN_FONTS,
  faceFromBytes,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const BLACK = { r: 0, g: 0, b: 0, a: 255 };
export const PAGE_W = 560;

export interface ScanLineSpec {
  family: string;
  text: string;
  size: number;
  ocrFamily?: string;
}

export interface ScanOptions {
  dpi: number;
  blur: number;
  noise: number;
  sideways?: boolean;
  rotate?: number;
  reversed?: boolean;
  skew?: number;
}

export const FONT_DIR = path.join(
  import.meta.dirname,
  "../../../../../../../app/core/src/main/resources/static/fonts",
);

export async function readBundledFaces(): Promise<Face[]> {
  const faces: Face[] = [];
  for (const spec of BUNDLED_SCAN_FONTS) {
    const [regularFile, boldFile] = spec.files;
    const regular = new Uint8Array(
      await readFile(path.join(FONT_DIR, regularFile)),
    );
    const boldBytes = new Uint8Array(
      await readFile(path.join(FONT_DIR, boldFile)),
    );
    registerFontBytes(spec.family, regular);
    registerFontBytes(spec.bold, boldBytes);
    const face = faceFromBytes(
      {
        label: spec.label,
        family: spec.family,
        bold: spec.bold,
        source: "bundled",
      },
      regular,
      boldBytes,
    );
    if (face) faces.push(face);
  }
  return faces;
}

function blankPdf(width: number, height: number): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> /Contents 4 0 R >>`,
      },
      { num: 4, body: streamBody("", "") },
    ],
    1,
  );
}

interface WordBox {
  text: string;
  left: number;
  right: number;
  baseline: number;
  size: number;
  ocrFamily: string;
}

function spaceAdvance(family: string): number {
  const bytes = getLocalFontBytes(family);
  const own = bytes ? parseFontMetrics(bytes)?.advances.get(0x20) : undefined;
  return own ?? base14SpaceAdvance(family) ?? 278;
}

function typeset(
  doc: EditorDocument,
  page: Page,
  lines: ScanLineSpec[],
  pitch: number,
  height: number,
  skew = 0,
): WordBox[] {
  const boxes: WordBox[] = [];
  lines.forEach((line, i) => {
    const baseline = height - pitch * (i + 0.7);
    const hh = spanOf(doc, page, "HH", line.family, line.size);
    const space = (spaceAdvance(line.family) * line.size) / 1000;
    let x = 30;
    for (const word of line.text.split(" ")) {
      const wordBaseline = baseline + skew * (x - 30);
      const ptrs = emitTextLine({
        doc,
        page,
        text: word,
        x,
        y: wordBaseline,
        fontSize: line.size,
        fill: BLACK,
        originalFontPtr: 0,
        fallbackFamily: line.family,
        tagMarks: [],
      });
      const span = measureObjSpanPt(doc.module, ptrs);
      if (!span) throw new Error(`could not set "${word}" in ${line.family}`);
      boxes.push({
        text: word,
        left: span.left,
        right: span.right,
        baseline: wordBaseline,
        size: line.size,
        ocrFamily: line.ocrFamily ?? "Helvetica",
      });
      x += spanOf(doc, page, `H${word}H`, line.family, line.size) - hh + space;
    }
  });
  return boxes;
}

function degrade(
  src: { rgba: Uint8Array; width: number; height: number },
  opts: ScanOptions,
  seed: number,
): { rgba: Uint8Array; width: number; height: number } {
  const f = (INK_SCALE * 72) / opts.dpi;
  const width = Math.max(1, Math.round(src.width / f));
  const height = Math.max(1, Math.round(src.height / f));
  let grey = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (
        let sy = Math.floor(y * f);
        sy < Math.min(src.height, Math.ceil((y + 1) * f));
        sy++
      )
        for (
          let sx = Math.floor(x * f);
          sx < Math.min(src.width, Math.ceil((x + 1) * f));
          sx++
        ) {
          const i = (sy * src.width + sx) * 4;
          sum +=
            0.299 * src.rgba[i] +
            0.587 * src.rgba[i + 1] +
            0.114 * src.rgba[i + 2];
          n++;
        }
      grey[y * width + x] = n ? sum / n : 255;
    }
  if (opts.blur > 0) {
    const r = Math.ceil(opts.blur);
    const weights = Array.from({ length: 2 * r + 1 }, (_, k) =>
      Math.exp(-((k - r) ** 2) / (2 * opts.blur * opts.blur)),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const out = new Float32Array(grey.length);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const xx = Math.min(width - 1, Math.max(0, x + k * dx));
            const yy = Math.min(height - 1, Math.max(0, y + k * dy));
            sum += grey[yy * width + xx] * weights[k + r];
          }
          out[y * width + x] = sum / total;
        }
      grey = out;
    }
  }
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < grey.length; i++) {
    const tone = grey[i] * 0.93 + 4;
    const paper = opts.reversed ? 255 - tone : tone;
    const v = Math.max(
      0,
      Math.min(255, paper + (rand() - 0.5) * 2 * opts.noise),
    );
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = Math.round(v);
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width, height };
}

export async function buildScan(
  lines: ScanLineSpec[],
  opts: ScanOptions,
  pitch = 48,
): Promise<{ doc: EditorDocument; page: Page }> {
  const height = Math.ceil(pitch * lines.length + 20);
  const clean = await EditorDocument.open(blankPdf(PAGE_W, height));
  const scanned = await EditorDocument.open(
    opts.sideways ? blankPdf(height, PAGE_W) : blankPdf(PAGE_W, height),
  );
  try {
    const cleanPage = clean.page(0);
    PdfiumTextReader.populate(clean, cleanPage);
    const boxes = typeset(clean, cleanPage, lines, pitch, height, opts.skew);
    const render = capturePatch(clean.module, cleanPage, {
      x: 0,
      y: 0,
      width: PAGE_W,
      height,
    });
    if (!render) throw new Error("could not render the clean page");
    const image = degrade(render, opts, lines.length * 7919 + opts.dpi);

    const page = scanned.page(0);
    PdfiumTextReader.populate(scanned, page);
    const m = scanned.module;
    const img = createBitmapImageObject(
      m,
      scanned.docPtr,
      page.pagePtr,
      image,
      0,
      0,
      PAGE_W,
      height,
    );
    if (!img) throw new Error("could not place the scan image");
    m.FPDFPage_InsertObject(page.pagePtr, img);
    for (const box of boxes) {
      const ptrs = emitTextLine({
        doc: scanned,
        page,
        text: box.text,
        x: box.left,
        y: box.baseline,
        fontSize: box.size,
        fill: BLACK,
        originalFontPtr: 0,
        fallbackFamily: box.ocrFamily,
        renderMode: 3,
        tagMarks: [],
      });
      opaqueStroke(m, ptrs);
      const span = measureObjSpanPt(m, ptrs);
      if (!span) continue;
      const sx =
        (box.right - box.left) / Math.max(1e-3, span.right - span.left);
      for (const p of ptrs)
        transformObject(m, p, sx, 0, 0, 1, box.left * (1 - sx), 0);
    }
    if (opts.sideways)
      moveAllObjects(m, page, { a: 0, b: 1, c: -1, d: 0, e: height, f: 0 });
    if (opts.rotate) m.FPDFPage_SetRotation(page.pagePtr, opts.rotate);
    page.markDirty();
    page.markNeedsGenerate();
    const { blob } = await exportToBlob(scanned, "scan.pdf");
    const doc = await EditorDocument.open(
      new Uint8Array(await blob.arrayBuffer()),
    );
    const out = doc.page(0);
    PdfiumTextReader.populate(doc, out);
    return { doc, page: out };
  } finally {
    clean.dispose();
    scanned.dispose();
  }
}
