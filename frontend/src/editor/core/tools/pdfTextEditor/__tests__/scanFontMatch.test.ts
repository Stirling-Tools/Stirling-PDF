// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  getDroppedBase14Chars,
  resetDroppedBase14Chars,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { renderLuma } from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  isScanRun,
  prefitScanRun,
  renderScanEdit,
  scanEditOf,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  setPreferredScanFace,
  type RankedStyle,
} from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  faceFromBytes,
  resetScanFaces,
  setBundledScanFaces,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { registerFontBytes } from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  buildScan,
  readBundledFaces,
  type ScanLineSpec,
  type ScanOptions,
} from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const SENTENCES = [
  "Invoice 4471 for Jane Example is due on 30 June",
  "Please return the signed copy to our Leeds office",
];

let bundled: Face[] = [];

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
  bundled = await readBundledFaces();
});

beforeEach(() => {
  setBundledScanFaces(bundled);
});

afterAll(() => {
  resetScanFaces();
  vi.unstubAllGlobals();
});

interface Sample extends ScanLineSpec {
  accept: string[];
  kind: "sans" | "serif" | "mono";
  bold: boolean;
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function choicesFor(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): Promise<RankedStyle[]> {
  while (!prefitScanRun(doc, page, run, performance.now() + 50))
    await nextTick();
  return scanEditOf(doc, run)?.block?.ranked ?? [];
}

async function choicesByLine(
  doc: EditorDocument,
  page: Page,
  samples: Sample[],
): Promise<Array<RankedStyle[]>> {
  const runs = page.runs.filter(isScanRun);
  const out: Array<RankedStyle[]> = [];
  for (const [i] of samples.entries()) {
    const baseline = page.height - 48 * (i + 0.7);
    const run = runs.find((r) => Math.abs(r.matrix.f - baseline) < 6);
    out.push(run ? await choicesFor(doc, page, run) : []);
  }
  return out;
}

function drawnFontNames(doc: EditorDocument, ptrs: number[]): string[] {
  const m = doc.module;
  return ptrs.map((p) => {
    const font = m.FPDFTextObj_GetFont(p);
    const len = m.FPDFFont_GetBaseFontName(font, 0, 0);
    const buf = m.pdfium.wasmExports.malloc(len);
    try {
      m.FPDFFont_GetBaseFontName(font, buf, len);
      return m.pdfium.UTF8ToString(buf);
    } finally {
      m.pdfium.wasmExports.free(buf);
    }
  });
}

function boldCut(choice: RankedStyle | undefined): boolean {
  if (!choice) return false;
  const { face, style } = choice;
  return style.family === face.bold && face.bold !== face.family;
}

const line = (
  family: string,
  accept: string[],
  kind: Sample["kind"],
  i: number,
  bold = false,
): Sample => ({
  family,
  text: SENTENCES[i % SENTENCES.length],
  size: 12,
  accept,
  kind,
  bold,
});

describe("matching a face to scanned text", () => {
  const SCAN: ScanOptions = { dpi: 200, blur: 0.5, noise: 6 };
  const samples: Sample[] = [
    line("Carlito", ["Calibri (Carlito)"], "sans", 0),
    line("Caladea Bold", ["Cambria (Caladea)"], "serif", 1, true),
    line("Helvetica-Bold", ["Helvetica / Arial"], "sans", 0, true),
    line("Times-Roman", ["Times"], "serif", 1),
    line("Courier", ["Courier"], "mono", 0),
    line("DejaVu Sans", ["DejaVu Sans"], "sans", 1),
  ];

  test(
    "names the face each line was typeset in",
    { timeout: 240_000 },
    async () => {
      const { doc, page } = await buildScan(samples, SCAN);
      try {
        const picked = await choicesByLine(doc, page, samples);
        const report = samples.map((s, i) => ({
          set: s.family,
          picked: picked[i][0]?.face.label ?? null,
          bold: boldCut(picked[i][0]),
        }));
        expect(report).toEqual(
          samples.map((s) => ({
            set: s.family,
            picked: s.accept[0],
            bold: s.bold,
          })),
        );
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "fits a block in short slices and reaches the same face",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan([samples[0]], SCAN);
      try {
        const run = page.runs.find(isScanRun)!;
        let slices = 0;
        while (!prefitScanRun(doc, page, run, 0)) {
          slices++;
          await nextTick();
        }
        expect(slices).toBeGreaterThan(1);
        expect(scanEditOf(doc, run)!.block?.style.family).toBe("Carlito");
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "a face picked in one block wins close calls in blocks fitted before",
    { timeout: 120_000 },
    async () => {
      const lines = [samples[0], { ...samples[0], text: "Quarterly review" }];
      const { doc, page } = await buildScan(lines, SCAN);
      try {
        const runs = page.runs.filter(isScanRun);
        for (const run of runs) await choicesFor(doc, page, run);
        const later = runs[1];
        const ranked = scanEditOf(doc, later)!.block!.ranked;
        const runnerUp = ranked.find(
          (r) => r !== ranked[0] && r.score >= ranked[0].score - 0.1,
        )!;
        setPreferredScanFace(doc, runnerUp.face.label);
        const state = scanEditOf(doc, later)!;
        renderScanEdit(doc, page, later, state, "Quiz");
        expect(drawnFontNames(doc, state.textPtrs)).toContain(
          runnerUp.style.family.replace(/ /g, ""),
        );
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "refits an untouched block when the picked font was not among its choices",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan([samples[0]], SCAN);
      try {
        const run = page.runs.find(isScanRun)!;
        const before = await choicesFor(doc, page, run);
        expect(before.map((c) => c.face.label)).not.toContain("Courier");
        setPreferredScanFace(doc, "Courier");
        expect(scanRunNeedsFit(doc, run)).toBe(true);
        await choicesFor(doc, page, run);
        expect(scanRunNeedsFit(doc, run)).toBe(false);
        expect(scanEditOf(doc, run)!.block!.preferred).toBe("Courier");
      } finally {
        doc.dispose();
      }
    },
  );

  test("offers the runners-up, best first", { timeout: 120_000 }, async () => {
    const { doc, page } = await buildScan([samples[0]], SCAN);
    try {
      const [choices] = await choicesByLine(doc, page, [samples[0]]);
      expect(choices.length).toBe(3);
      const scores = choices.map((c) => c.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      expect(new Set(choices.map((c) => c.face.label)).size).toBe(3);
    } finally {
      doc.dispose();
    }
  });
});

function inkProfile(
  page: Page,
  doc: EditorDocument,
  x: number,
  width: number,
  baseline: number,
) {
  return renderLuma(
    doc.module,
    page,
    { x, y: baseline - 4, width, height: 16 },
    0,
  )!;
}

function likeness(
  a: { data: Float32Array; width: number; height: number },
  b: { data: Float32Array; width: number; height: number },
): number {
  const firstInk = (img: typeof a) => {
    for (let x = 0; x < img.width; x++)
      for (let y = 0; y < img.height; y++)
        if (img.data[y * img.width + x] < 128) return x;
    return 0;
  };
  const ax = firstInk(a);
  const bx = firstInk(b);
  const w = Math.min(a.width - ax, b.width - bx);
  const h = Math.min(a.height, b.height);
  const pa: number[] = [];
  const pb: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      pa.push(a.data[y * a.width + ax + x]);
      pb.push(b.data[y * b.width + bx + x]);
    }
  const mean = (v: number[]) => v.reduce((p, q) => p + q, 0) / v.length;
  const ma = mean(pa);
  const mb = mean(pb);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < pa.length; i++) {
    ab += (pa[i] - ma) * (pb[i] - mb);
    aa += (pa[i] - ma) ** 2;
    bb += (pb[i] - mb) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
}

const STATIC_FONTS = path.join(
  import.meta.dirname,
  "../../../../../../../app/core/src/main/resources/static/fonts",
);

async function staticFace(family: string, file: string): Promise<Face | null> {
  const bytes = new Uint8Array(await readFile(path.join(STATIC_FONTS, file)));
  registerFontBytes(family, bytes);
  return faceFromBytes(
    { label: family, family, bold: `${family} Bold`, source: "bundled" },
    bytes,
    null,
  );
}

async function savedText(doc: EditorDocument): Promise<string> {
  const { blob } = await exportToBlob(doc, "scan.pdf");
  const back = await EditorDocument.open(
    new Uint8Array(await blob.arrayBuffer()),
  );
  try {
    const page = back.page(0);
    PdfiumTextReader.populate(back, page);
    return page.runs.map((r) => r.text).join(" ");
  } finally {
    back.dispose();
  }
}

describe("editing sideways scanned text", () => {
  const SCAN: ScanOptions = { dpi: 200, blur: 0.5, noise: 6 };
  const line: ScanLineSpec = {
    family: "Carlito",
    text: "Invoice 4471 for Jane Example is due on 30 June",
    size: 12,
  };

  test(
    "fits the face upright and draws the edit turned back",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan([line], {
        ...SCAN,
        sideways: true,
      });
      try {
        const run = page.runs.find(
          (r) => isScanRun(r) && r.text.includes("Jane"),
        )!;
        expect((await choicesFor(doc, page, run))[0]?.face.label).toBe(
          "Calibri (Carlito)",
        );
        const band = {
          x: run.bounds.x - 4,
          y: run.bounds.y,
          width: run.bounds.width + 8,
          height: run.bounds.height,
        };
        const before = renderLuma(doc.module, page, band, 0)!.data;
        renderScanEdit(
          doc,
          page,
          run,
          scanEditOf(doc, run)!,
          run.text.replace("Jane", "Mary"),
        );
        const after = renderLuma(doc.module, page, band, 0)!.data;
        let changed = 0;
        for (let i = 0; i < before.length; i++)
          if (Math.abs(before[i] - after[i]) > 40) changed++;
        expect(changed).toBeGreaterThan(50);
        expect(await savedText(doc)).toContain("Mary");
      } finally {
        doc.dispose();
      }
    },
  );
});

describe("matching scanned text in other scripts", () => {
  const SCAN: ScanOptions = { dpi: 200, blur: 0.6, noise: 8 };
  const russian: ScanLineSpec = {
    family: "DejaVu Sans",
    text: "Счёт 4471 для Ивана Петрова к оплате до 30 июня",
    size: 14,
    ocrFamily: "DejaVu Sans",
  };

  test(
    "picks a face that can draw Cyrillic and the edit survives a save",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan([russian], SCAN);
      try {
        const run = page.runs.find(isScanRun)!;
        const [top] = await choicesFor(doc, page, run);
        expect(top.face.label).toBe("DejaVu Sans");
        renderScanEdit(
          doc,
          page,
          run,
          scanEditOf(doc, run)!,
          run.text.replace("Ивана", "Марии"),
        );
        expect(await savedText(doc)).toContain("Марии");
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "picks the script's own face when the server has one",
    { timeout: 120_000 },
    async () => {
      const japanese = await staticFace(
        "Noto Sans JP",
        "NotoSansJP-Regular.ttf",
      );
      setBundledScanFaces([...bundled, japanese!]);
      const { doc, page } = await buildScan(
        [
          {
            family: "Noto Sans JP",
            text: "請求書 4471 六月 三十日 までに お支払い ください",
            size: 14,
            ocrFamily: "Noto Sans JP",
          },
        ],
        SCAN,
      );
      try {
        const run = page.runs.find(isScanRun)!;
        expect((await choicesFor(doc, page, run))[0]?.face.label).toBe(
          "Noto Sans JP",
        );
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "sizes caps-only Cyrillic and a Japanese line without digits by their own glyph height",
    { timeout: 120_000 },
    async () => {
      const japanese = await staticFace(
        "Noto Sans JP",
        "NotoSansJP-Regular.ttf",
      );
      setBundledScanFaces([...bundled, japanese!]);
      const lines: ScanLineSpec[] = [
        {
          family: "DejaVu Sans",
          text: "СЧЕТ НА ОПЛАТУ ДЛЯ ИВАНА ПЕТРОВА",
          size: 14,
          ocrFamily: "DejaVu Sans",
        },
        {
          family: "Noto Sans JP",
          text: "請求書 六月 三十日 までに お支払い ください",
          size: 14,
          ocrFamily: "Noto Sans JP",
        },
      ];
      const { doc, page } = await buildScan(lines, SCAN);
      try {
        for (const spec of lines) {
          const run = page.runs.find(
            (r) => isScanRun(r) && r.text.startsWith(spec.text.slice(0, 3)),
          )!;
          await choicesFor(doc, page, run);
          const size = scanEditOf(doc, run)!.block!.style.fontSize;
          expect(Math.abs(size / spec.size - 1)).toBeLessThan(0.1);
        }
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "offers nothing it cannot draw and leaves the scan alone when an edit cannot be drawn",
    { timeout: 120_000 },
    async () => {
      const korean = await staticFace("Noto Sans KR", "NotoSansKR-Regular.ttf");
      expect(korean).toBeNull();
      resetDroppedBase14Chars();
      const { doc, page } = await buildScan(
        [
          {
            family: "Noto Sans KR",
            text: "청구서 4471 김민준 님 6월 30일까지 납부",
            size: 14,
            ocrFamily: "Noto Sans KR",
          },
        ],
        SCAN,
      );
      try {
        const run = page.runs.find(isScanRun)!;
        expect(await choicesFor(doc, page, run)).toEqual([]);
        const line = scanEditOf(doc, run)!.lines[0];
        const region = {
          x: 20,
          y: line.baseline - 6,
          width: 500,
          height: line.height + 8,
        };
        const before = renderLuma(doc.module, page, region, 0)!.data;
        renderScanEdit(
          doc,
          page,
          run,
          scanEditOf(doc, run)!,
          run.text.replace("김민준", "이서연"),
        );
        expect(getDroppedBase14Chars()).toEqual(
          expect.arrayContaining(["이", "서", "연"]),
        );
        expect(renderLuma(doc.module, page, region, 0)!.data).toEqual(before);
      } finally {
        doc.dispose();
      }
    },
  );
});

describe("drawing typed words from the scan's own letters", () => {
  const SCAN: ScanOptions = { dpi: 200, blur: 0.5, noise: 6 };
  const spec: ScanLineSpec = {
    family: "DejaVu Sans",
    text: "Invoice 4471 for Jane Example is due on 30 June",
    size: 12,
  };

  async function retypeAsJane(forceFont: boolean): Promise<number> {
    setBundledScanFaces(bundled.filter((f) => f.family !== spec.family));
    const { doc, page } = await buildScan([spec], SCAN);
    try {
      const run = page.runs.find(isScanRun)!;
      const state = scanEditOf(doc, run)!;
      const words = state.lines[0].words;
      const jane = words.find((w) => w.text.trim() === "Jane")!;
      const june = words.find((w) => w.text.trim() === "June")!;
      const baseline = state.lines[0].baseline;
      const width = jane.right - jane.x + 3;
      const scanned = inkProfile(page, doc, jane.x - 2, width, baseline);
      const [best] = await choicesFor(doc, page, run);
      if (forceFont) state.override.style = best.style;
      renderScanEdit(doc, page, run, state, run.text.replace("June", "Jane"));
      return likeness(
        scanned,
        inkProfile(page, doc, june.x - 2, width, baseline),
      );
    } finally {
      doc.dispose();
    }
  }

  test(
    "looks more like the scan than the best-fitting font does",
    { timeout: 60_000 },
    async () => {
      const fromScan = await retypeAsJane(false);
      const fromFont = await retypeAsJane(true);
      expect(fromScan).toBeGreaterThan(0.75);
      expect(fromScan).toBeGreaterThan(fromFont + 0.2);
    },
  );
});
