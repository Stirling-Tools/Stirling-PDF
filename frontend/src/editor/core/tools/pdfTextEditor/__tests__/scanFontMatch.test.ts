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

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

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
  drawnBlockStyle,
  isScanRun,
  prefitScanRun,
  renderScanEdit,
  scanEditOf,
  scanRunNeedsFit,
  scanTypingDropped,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  CLOSE_CALL,
  preferredScanFace,
  preferredStyle,
  setPreferredScanFace,
  type RankedStyle,
  type ScanStyle,
} from "@editor/tools/pdfTextEditor/commands/scanFit";
import { isEvenlySpaced } from "@editor/tools/pdfTextEditor/commands/scanStyle";
import { SetScanStyleCommand } from "@editor/tools/pdfTextEditor/commands/SetScanStyleCommand";
import {
  SERVER_FONTS_URL,
  resetServerFontsCache,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import {
  COURIER,
  HELVETICA,
  TIMES,
  faceCovers,
  faceFromBytes,
  loadScriptScanFaces,
  resetScanFaces,
  scanScriptsOf,
  setBundledScanFaces,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { registerFontBytes } from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  FONT_DIR,
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
  accept: string;
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
  accept: string,
  i: number,
  bold = false,
): Sample => ({
  family,
  text: SENTENCES[i % SENTENCES.length],
  size: 12,
  accept,
  bold,
});

describe("spotting typewriter spacing", () => {
  const PITCH = 7.2;
  const centresOn = (text: string, cell: number) =>
    [...text].flatMap((ch, i) => (/\s/.test(ch) ? [] : [i * cell]));

  test("reads a monospaced line with spaces as typewriter text", () => {
    for (const text of [
      "Invoice 4471 for Jane Example is due on 30 June",
      "DATE OF BIRTH 12 MAY 1987",
    ])
      expect(isEvenlySpaced(centresOn(text, PITCH), text)).toBe(true);
  });

  test("does not read proportional glyph steps as typewriter text", () => {
    const text = "Invoice for Jane Example";
    let x = 0;
    const centres = [...text].flatMap((ch, i) => {
      x += PITCH * (0.5 + ((i * 7) % 5) * 0.17);
      return /\s/.test(ch) ? [] : [x];
    });
    expect(isEvenlySpaced(centres, text)).toBe(false);
  });
});

describe("letting a picked face win close calls", () => {
  const doc = {} as EditorDocument;
  const style = (family: string): ScanStyle => ({
    family,
    fontSize: 12,
    stretch: 1,
    ink: { r: 0, g: 0, b: 0, a: 255 },
    weight: 0,
    hollow: 0,
    softness: 0,
  });
  const ranked: RankedStyle[] = [
    { face: HELVETICA, style: style("Helvetica"), score: 0.9 },
    { face: TIMES, style: style("Times-Roman"), score: 0.9 - CLOSE_CALL / 2 },
    { face: COURIER, style: style("Courier"), score: 0.9 - CLOSE_CALL * 2 },
  ];
  const drawnWith = (label: string | null) => {
    setPreferredScanFace(doc, label);
    return preferredStyle(doc, ranked)?.family ?? null;
  };

  test("draws a pick that is a close call", () => {
    expect(drawnWith(TIMES.label)).toBe("Times-Roman");
  });

  test("keeps the best fit when the pick is well behind it", () => {
    expect(drawnWith(COURIER.label)).toBeNull();
  });

  test("keeps the best fit when the pick is not among the choices", () => {
    expect(drawnWith("Calibri (Carlito)")).toBeNull();
    expect(drawnWith(null)).toBeNull();
  });

  test("still draws the pick once it is the best fit", () => {
    expect(drawnWith(HELVETICA.label)).toBe("Helvetica");
  });
});

describe("matching a face to scanned text", () => {
  const SCAN: ScanOptions = { dpi: 200, blur: 0.5, noise: 6 };
  const samples: Sample[] = [
    line("Carlito", "Calibri (Carlito)", 0),
    line("Caladea Bold", "Cambria (Caladea)", 1, true),
    line("Helvetica-Bold", "Helvetica / Arial", 0, true),
    line("Times-Roman", "Times", 1),
    line("Courier", "Courier", 0),
    line("DejaVu Sans", "DejaVu Sans", 1),
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
            picked: s.accept,
            bold: s.bold,
          })),
        );
        const scores = picked[0].map((c) => c.score);
        expect([...scores].sort((a, b) => b - a)).toEqual(scores);
        expect(new Set(picked[0].map((c) => c.face.label)).size).toBe(3);
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
    "a picked face wins a close call and stays once the block is drawn",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan(
        [{ ...samples[0], text: "Quarterly review" }],
        SCAN,
      );
      try {
        const run = page.runs.find(isScanRun)!;
        const [best, runnerUp] = await choicesFor(doc, page, run);
        expect(runnerUp.score).toBeGreaterThanOrEqual(best.score - CLOSE_CALL);
        setPreferredScanFace(doc, runnerUp.face.label);
        const state = scanEditOf(doc, run)!;
        const drawnFamily = () =>
          drawnFontNames(doc, state.textPtrs).map((n) => n.replace(/ /g, ""));
        renderScanEdit(doc, page, run, state, "Quiz");
        expect(drawnFamily()).toContain(
          runnerUp.style.family.replace(/ /g, ""),
        );
        expect(drawnBlockStyle(doc, state)).toBe(runnerUp.style);
        setPreferredScanFace(doc, null);
        renderScanEdit(doc, page, run, state, "Quizzes");
        expect(drawnFamily()).toContain(
          runnerUp.style.family.replace(/ /g, ""),
        );
        expect(drawnBlockStyle(doc, state)).toBe(runnerUp.style);
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "a picked face still wins when the block's first edit only deleted words",
    { timeout: 120_000 },
    async () => {
      const sample = { ...samples[0], text: "Quarterly review" };
      const probe = await buildScan([sample], SCAN);
      let runnerUp: RankedStyle;
      try {
        const run = probe.page.runs.find(isScanRun)!;
        runnerUp = (await choicesFor(probe.doc, probe.page, run))[1];
      } finally {
        probe.doc.dispose();
      }
      const { doc, page } = await buildScan([sample], SCAN);
      try {
        const run = page.runs.find(isScanRun)!;
        setPreferredScanFace(doc, runnerUp.face.label);
        const state = scanEditOf(doc, run)!;
        expect(renderScanEdit(doc, page, run, state, "Quarterly")).toBe(true);
        expect(state.block).toBeUndefined();
        renderScanEdit(doc, page, run, state, "Quarterly reviews");
        expect(drawnBlockStyle(doc, state)?.family).toBe(runnerUp.style.family);
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "undoing a pick redraws the block in its own best face",
    { timeout: 120_000 },
    async () => {
      const lines = [samples[0], { ...samples[0], text: "Quarterly review" }];
      const { doc, page } = await buildScan(lines, SCAN);
      try {
        const run = page.runs.filter(isScanRun)[1];
        const ranked = await choicesFor(doc, page, run);
        const runnerUp = ranked[1];
        expect(runnerUp.score).toBeGreaterThanOrEqual(
          ranked[0].score - CLOSE_CALL,
        );
        const state = scanEditOf(doc, run)!;
        renderScanEdit(doc, page, run, state, "Quiz");
        const band = {
          x: run.bounds.x - 4,
          y: run.bounds.y,
          width: run.bounds.width + 8,
          height: run.bounds.height,
        };
        const best = renderLuma(doc.module, page, band, 0)!.data;
        const pick = new SetScanStyleCommand({
          pageIndex: 0,
          runId: run.id,
          choice: runnerUp,
        });
        pick.apply(doc);
        expect(preferredScanFace(doc)).toBe(runnerUp.face.label);
        expect(renderLuma(doc.module, page, band, 0)!.data).not.toEqual(best);
        pick.revert(doc);
        expect(preferredScanFace(doc)).toBeNull();
        expect(renderLuma(doc.module, page, band, 0)!.data).toEqual(best);
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "scores the picked font in an untouched block that did not offer it",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan([samples[0]], SCAN);
      try {
        const run = page.runs.find(isScanRun)!;
        const before = await choicesFor(doc, page, run);
        expect(before.map((c) => c.face.label)).not.toContain("Courier");
        setPreferredScanFace(doc, "Courier");
        expect(scanRunNeedsFit(doc, run)).toBe(true);
        const after = await choicesFor(doc, page, run);
        expect(scanRunNeedsFit(doc, run)).toBe(false);
        expect(scanEditOf(doc, run)!.block!.preferred).toBe("Courier");
        expect(
          after.every((c) => before.includes(c) || c.face.label === "Courier"),
        ).toBe(true);
      } finally {
        doc.dispose();
      }
    },
  );
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

async function staticFace(family: string, file: string): Promise<Face | null> {
  const bytes = new Uint8Array(await readFile(path.join(FONT_DIR, file)));
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

async function savedFonts(doc: EditorDocument) {
  const { blob } = await exportToBlob(doc, "scan.pdf");
  const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
  return {
    names: [
      ...new Set(
        [...text.matchAll(/\/BaseFont\s*\/([^\s/<>[\]()]+)/g)].map((m) => m[1]),
      ),
    ],
    embedded: text.split("/FontFile2").length - 1,
  };
}

describe("what an edit leaves in the saved file", () => {
  test("keeps only the face the edit draws", { timeout: 120_000 }, async () => {
    const { doc, page } = await buildScan(
      [
        {
          family: "Carlito",
          text: SENTENCES[0],
          size: 12,
        },
      ],
      {
        dpi: 300,
        blur: 0.3,
        noise: 4,
      },
    );
    try {
      const run = page.runs.find(isScanRun)!;
      const [top] = await choicesFor(doc, page, run);
      expect(top.style.family).toBe("Carlito");
      const state = scanEditOf(doc, run)!;
      state.override.style = { ...top.style, softness: 0 };
      renderScanEdit(doc, page, run, state, run.text.replace("Jane", "Quiz"));
      expect(drawnFontNames(doc, state.textPtrs)).toContain("Carlito");
      const saved = await savedFonts(doc);
      expect(saved.embedded).toBe(1);
      expect(saved.names.filter((n) => !n.startsWith("Helvetica"))).toEqual([
        "Carlito",
      ]);
    } finally {
      doc.dispose();
    }
  });
});

describe("softening typed words to the scan", () => {
  test(
    "keeps the ascenders and descenders the replaced word did not have",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan(
        [{ family: "Carlito", text: SENTENCES[0], size: 12 }],
        { dpi: 200, blur: 0.5, noise: 6 },
      );
      try {
        const run = page.runs.find(isScanRun)!;
        const [top] = await choicesFor(doc, page, run);
        expect(top.style.softness).toBeGreaterThan(0);
        const state = scanEditOf(doc, run)!;
        const on = state.lines[0].words.find((w) => w.text.trim() === "on")!;
        const baseline = state.lines[0].baseline;
        const inked = (bottom: number, top: number) => {
          const img = renderLuma(
            doc.module,
            page,
            {
              x: on.x,
              y: baseline + bottom,
              width: on.right - on.x,
              height: top - bottom,
            },
            0,
          )!;
          return img.data.filter((l) => l < 128).length;
        };
        renderScanEdit(doc, page, run, state, run.text.replace(" on ", " by "));
        expect(state.classes).toEqual([]);
        expect(inked(7, 9)).toBeGreaterThan(0);
        expect(inked(-2.5, -1)).toBeGreaterThan(0);
      } finally {
        doc.dispose();
      }
    },
  );
});

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

describe("editing scanned text on a page turned with /Rotate", () => {
  test("fits the face and draws the edit", { timeout: 120_000 }, async () => {
    const { doc, page } = await buildScan(
      [{ family: "Carlito", text: SENTENCES[0], size: 12 }],
      { dpi: 200, blur: 0.5, noise: 6, rotate: 1 },
    );
    try {
      const run = page.runs.find(isScanRun)!;
      expect((await choicesFor(doc, page, run))[0]?.face.label).toBe(
        "Calibri (Carlito)",
      );
      const state = scanEditOf(doc, run)!;
      const jane = state.lines[0].words.find((w) => w.text.trim() === "Jane")!;
      const band = {
        x: jane.x - 1,
        y: state.lines[0].baseline - 3,
        width: jane.right - jane.x + 2,
        height: 13,
      };
      const before = renderLuma(doc.module, page, band, 0)!.data;
      renderScanEdit(doc, page, run, state, run.text.replace("Jane", "Mary"));
      const after = renderLuma(doc.module, page, band, 0)!.data;
      let changed = 0;
      for (let i = 0; i < before.length; i++)
        if (Math.abs(before[i] - after[i]) > 40) changed++;
      expect(changed).toBeGreaterThan(50);
      expect(state.textPtrs.length).toBeGreaterThan(0);
    } finally {
      doc.dispose();
    }
  });

  test(
    "fits the face of a sideways scan on a turned page",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan(
        [{ family: "Carlito", text: SENTENCES[0], size: 12 }],
        { dpi: 200, blur: 0.5, noise: 6, sideways: true, rotate: 1 },
      );
      try {
        const run = page.runs.find(isScanRun)!;
        expect((await choicesFor(doc, page, run))[0]?.face.label).toBe(
          "Calibri (Carlito)",
        );
      } finally {
        doc.dispose();
      }
    },
  );
});

describe("editing light text on a dark fill", () => {
  test(
    "fits the face and redraws the edit light",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan(
        [{ family: "Carlito", text: SENTENCES[0], size: 12 }],
        { dpi: 200, blur: 0.5, noise: 6, reversed: true },
      );
      try {
        const run = page.runs.find(isScanRun)!;
        expect((await choicesFor(doc, page, run))[0]?.face.label).toBe(
          "Calibri (Carlito)",
        );
        const state = scanEditOf(doc, run)!;
        const jane = state.lines[0].words.find(
          (w) => w.text.trim() === "Jane",
        )!;
        renderScanEdit(doc, page, run, state, run.text.replace("Jane", "Mary"));
        const band = renderLuma(
          doc.module,
          page,
          {
            x: jane.x - 1,
            y: state.lines[0].baseline - 3,
            width: jane.right - jane.x + 2,
            height: 13,
          },
          0,
        )!;
        expect(band.data.filter((l) => l > 160).length).toBeGreaterThan(50);
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
      const id = "a".repeat(64);
      const bytes = await readFile(
        path.join(FONT_DIR, "NotoSansJP-Regular.ttf"),
      );
      get.mockImplementation(async (url: string) =>
        url === SERVER_FONTS_URL
          ? {
              data: {
                families: [
                  {
                    family: "Noto Sans JP",
                    faces: [{ id, style: "Regular", weight: 400 }],
                  },
                ],
              },
            }
          : { data: new Uint8Array(bytes).buffer },
      );
      const text = "請求書 4471 六月 三十日 までに お支払い ください";
      await loadScriptScanFaces(scanScriptsOf(text));
      const { doc, page } = await buildScan(
        [{ family: "Noto Sans JP", text, size: 14, ocrFamily: "Noto Sans JP" }],
        SCAN,
      );
      try {
        const run = page.runs.find(isScanRun)!;
        expect((await choicesFor(doc, page, run))[0]?.face.label).toBe(
          "Noto Sans JP",
        );
      } finally {
        doc.dispose();
        resetScanFaces();
        resetServerFontsCache();
      }
    },
  );

  test("the bundled Chinese and Korean fonts can be matched", async () => {
    const chinese = await staticFace("Noto Sans SC", "NotoSansSC-Regular.ttf");
    const korean = await staticFace("Noto Sans KR", "NotoSansKR-Regular.ttf");
    expect(chinese && faceCovers(chinese, "华级们这说话东车书门关进")).toBe(
      true,
    );
    expect(korean && faceCovers(korean, "청구서 김민준 님 납부")).toBe(true);
  });

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
      await staticFace("Noto Sans KR", "NotoSansKR-Regular.ttf");
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

  test(
    "refits a block no face could draw once a face for it arrives",
    { timeout: 120_000 },
    async () => {
      const japanese = await staticFace(
        "Noto Sans JP",
        "NotoSansJP-Regular.ttf",
      );
      const text = "請求書 六月 三十日 までに お支払い ください";
      const { doc, page } = await buildScan(
        [{ family: "Noto Sans JP", text, size: 14, ocrFamily: "Noto Sans JP" }],
        SCAN,
      );
      try {
        const run = page.runs.find(isScanRun)!;
        expect(await choicesFor(doc, page, run)).toEqual([]);
        expect(scanRunNeedsFit(doc, run)).toBe(false);
        setBundledScanFaces([...bundled, japanese!]);
        expect(scanRunNeedsFit(doc, run)).toBe(true);
        const state = scanEditOf(doc, run)!;
        renderScanEdit(doc, page, run, state, run.text.replace("六月", "七月"));
        expect(state.block?.ranked[0]?.face.label).toBe("Noto Sans JP");
        expect(drawnFontNames(doc, state.textPtrs)).toEqual([
          expect.stringMatching(/^NotoSansJP/),
        ]);
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

  test(
    "looks more like the scan than the best-fitting font does",
    { timeout: 60_000 },
    async () => {
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
        const retyped = () => {
          renderScanEdit(
            doc,
            page,
            run,
            state,
            run.text.replace("June", "Jane"),
          );
          return likeness(
            scanned,
            inkProfile(page, doc, june.x - 2, width, baseline),
          );
        };
        const fromScan = retyped();
        expect(state.typedFromScan).toBe(true);
        state.override.style = best.style;
        const fromFont = retyped();
        expect(state.typedFromScan).toBe(false);
        expect(fromScan).toBeGreaterThan(0.75);
        expect(fromScan).toBeGreaterThan(fromFont + 0.2);
      } finally {
        doc.dispose();
      }
    },
  );
});

describe("edits that need no font, and text no font can draw", () => {
  const SCAN: ScanOptions = { dpi: 200, blur: 0.5, noise: 6 };

  test(
    "deletes words from a block no font can draw, and a refused edit leaves the deletion as it was",
    { timeout: 120_000 },
    async () => {
      await staticFace("Noto Sans KR", "NotoSansKR-Regular.ttf");
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
        const state = scanEditOf(doc, run)!;
        const original = run.text;
        const line = state.lines[0];
        const region = {
          x: 20,
          y: line.baseline - 6,
          width: 500,
          height: line.height + 8,
        };
        expect(scanTypingDropped(run)).toBe(true);
        const deleted = original.replace("김민준 ", "");
        expect(renderScanEdit(doc, page, run, state, deleted)).toBe(true);
        expect(run.text).toBe(deleted);
        expect(state.lifted.size).toBeGreaterThan(0);
        expect(scanRunNeedsFit(doc, run)).toBe(true);
        const afterDelete = renderLuma(doc.module, page, region, 0)!.data;
        const leaves = [...run.paragraphLeafPtrs];

        expect(
          renderScanEdit(
            doc,
            page,
            run,
            state,
            deleted.replace("님", "이서연"),
          ),
        ).toBe(false);
        expect(run.text).toBe(deleted);
        expect(run.paragraphLeafPtrs).toEqual(leaves);
        expect(renderLuma(doc.module, page, region, 0)!.data).toEqual(
          afterDelete,
        );

        expect(renderScanEdit(doc, page, run, state, original)).toBe(true);
        expect(state.lifted.size).toBe(0);
        expect(await savedText(doc)).toContain("김민준");
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "refuses typed Hebrew in a block whose face covers it, rather than drawing it backwards",
    { timeout: 120_000 },
    async () => {
      resetDroppedBase14Chars();
      const { doc, page } = await buildScan(
        [{ family: "DejaVu Sans", text: SENTENCES[0], size: 12 }],
        SCAN,
      );
      try {
        const run = page.runs.find(isScanRun)!;
        const state = scanEditOf(doc, run)!;
        expect(scanTypingDropped(run)).toBe(false);
        expect(
          renderScanEdit(
            doc,
            page,
            run,
            state,
            run.text.replace("Jane", "שרה"),
          ),
        ).toBe(false);
        expect(state.created).toEqual([]);
        expect(getDroppedBase14Chars()).toEqual(
          expect.arrayContaining(["ש", "ר", "ה"]),
        );
      } finally {
        doc.dispose();
      }
    },
  );

  test(
    "keeps the spaces between words whose hidden copies were redrawn",
    { timeout: 120_000 },
    async () => {
      const { doc, page } = await buildScan(
        [{ family: "Carlito", text: SENTENCES[0], size: 12 }],
        SCAN,
      );
      try {
        const run = page.runs.find(isScanRun)!;
        const state = scanEditOf(doc, run)!;
        const original = run.text;
        renderScanEdit(
          doc,
          page,
          run,
          state,
          original
            .replace("Invoice", "Invoices issued")
            .replace("Jane", "Mary"),
        );
        const edited = await savedText(doc);
        expect(edited).toContain("issued 4471 for Mary Example is due");
        renderScanEdit(doc, page, run, state, original);
        expect(await savedText(doc)).toContain(SENTENCES[0]);
      } finally {
        doc.dispose();
      }
    },
  );
});
