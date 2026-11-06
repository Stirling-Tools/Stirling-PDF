// @vitest-environment node
import { readFile, writeFile } from "node:fs/promises";
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
import { renderLuma } from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  isScanRun,
  prefitScanRun,
  renderScanEdit,
  setPreferredScanFace,
  scanEditOf,
  scanStyleChoices,
  type RankedStyle,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  faceFromBytes,
  resetScanFaces,
  setBundledScanFaces,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { fontFace } from "@editor/tools/pdfTextEditor/util/fontCollection";
import { registerFontBytes } from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  buildScan,
  readBundledFaces,
  registerTruthFont,
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

function choicesByLine(
  doc: EditorDocument,
  page: Page,
  samples: Sample[],
): Array<RankedStyle[]> {
  const runs = page.runs.filter(isScanRun);
  return samples.map((_, i) => {
    const baseline = page.height - 48 * (i + 0.7);
    const run = runs.find((r) => Math.abs(r.matrix.f - baseline) < 6);
    return run ? scanStyleChoices(doc, page, run) : [];
  });
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
        const picked = choicesByLine(doc, page, samples);
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
        while (!prefitScanRun(doc, page, run, performance.now() + 5)) slices++;
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
        for (const run of runs)
          while (!prefitScanRun(doc, page, run, Infinity));
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

  test("offers the runners-up, best first", { timeout: 120_000 }, async () => {
    const { doc, page } = await buildScan([samples[0]], SCAN);
    try {
      const [choices] = choicesByLine(doc, page, [samples[0]]);
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
        const [top] = scanStyleChoices(doc, page, run);
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
        expect(scanStyleChoices(doc, page, run)[0]?.face.label).toBe(
          "Noto Sans JP",
        );
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
        expect(scanStyleChoices(doc, page, run)).toEqual([]);
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
      if (forceFont)
        state.override.style = scanStyleChoices(doc, page, run)[0].style;
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

const SYSTEM_TRUTH: Array<[string, string, string[], Sample["kind"]]> = [
  [
    "Arial",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    ["Helvetica / Arial"],
    "sans",
  ],
  [
    "Arial Bold",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ["Helvetica / Arial"],
    "sans",
  ],
  [
    "Times New Roman",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    ["Times"],
    "serif",
  ],
  [
    "Courier New",
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
    ["Courier"],
    "mono",
  ],
  ["Georgia", "/System/Library/Fonts/Supplemental/Georgia.ttf", [], "serif"],
  [
    "Verdana",
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
    ["DejaVu Sans"],
    "sans",
  ],
  [
    "Tahoma",
    "/System/Library/Fonts/Supplemental/Tahoma.ttf",
    ["DejaVu Sans"],
    "sans",
  ],
  [
    "Trebuchet MS",
    "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf",
    [],
    "sans",
  ],
];

const BENCH_SENTENCES = [
  "Invoice 4471 for Jane Example is due on 30 June",
  "Please return the signed copy to our Leeds office",
  "Quarterly revenue grew by 12% after the merger",
  "My dog quickly jumped over seven brown boxes",
  "Shipping address: 18 Kingsway, Bristol BS2 9QZ",
  "We regret to inform you that the policy has lapsed",
];

const HELDOUT_SENTENCES = [
  "Minutes of the annual general meeting held in March",
  "Total amount payable within fourteen days: 2,380.95",
  "Kindly sign below to acknowledge receipt of goods",
  "Our reference XK-5513/B, your letter of 9 August",
  "The tenant shall keep the property in good repair",
  "Questions? Call 0161 496 0723 or visit our website",
];

describe.skipIf(!process.env.SCAN_FONT_BENCH)("scan font benchmark", () => {
  test(
    "reports accuracy per scan quality",
    { timeout: 3_600_000 },
    async () => {
      const faces: Sample[] = [
        line("Helvetica", ["Helvetica / Arial"], "sans", 0),
        line("Helvetica-Bold", ["Helvetica / Arial"], "sans", 1, true),
        line("Times-Roman", ["Times"], "serif", 0),
        line("Times-Bold", ["Times"], "serif", 1, true),
        line("Courier", ["Courier"], "mono", 0),
        line("Carlito", ["Calibri (Carlito)"], "sans", 1),
        line("Carlito Bold", ["Calibri (Carlito)"], "sans", 0, true),
        line("Caladea", ["Cambria (Caladea)"], "serif", 1),
        line("Caladea Bold", ["Cambria (Caladea)"], "serif", 0, true),
        line("DejaVu Sans", ["DejaVu Sans"], "sans", 1),
        line("DejaVu Serif", ["DejaVu Serif"], "serif", 0),
      ];
      for (const [family, file, accept, kind] of SYSTEM_TRUTH) {
        if (await registerTruthFont(family, file))
          faces.push(
            line(family, accept, kind, faces.length, family.endsWith("Bold")),
          );
      }
      const samples = [0, 3].flatMap((offset) =>
        faces.map((f, i) => ({
          ...f,
          text: (process.env.SCAN_FONT_BENCH_HELDOUT
            ? HELDOUT_SENTENCES
            : BENCH_SENTENCES)[(i + offset) % BENCH_SENTENCES.length],
          size: Number(process.env.SCAN_FONT_BENCH_SIZE ?? f.size),
        })),
      );
      const qualities: Array<[string, ScanOptions]> = [
        ["300dpi crisp", { dpi: 300, blur: 0.3, noise: 4 }],
        ["200dpi", { dpi: 200, blur: 0.6, noise: 8 }],
        ["150dpi soft", { dpi: 150, blur: 0.9, noise: 10 }],
      ];
      const rows: string[] = [];
      const header =
        "faces      | quality       | face top-1 | face top-3 | class | weight";
      rows.push(header, "-".repeat(header.length));
      const misses: string[] = [];
      const device: Face[] = [];
      if (process.env.SCAN_FONT_BENCH_DEVICE)
        for (const [family, file] of SYSTEM_TRUTH) {
          if (family.endsWith("Bold")) continue;
          const name = path.basename(file);
          const face = await systemFace(
            family,
            [name, ""],
            [name.replace(".ttf", " Bold.ttf"), ""],
          );
          if (face) device.push(face);
        }
      if (device.length > 0)
        for (const s of samples) {
          const own = s.family.replace(/ Bold$/, "");
          if (device.some((f) => f.label === own)) s.accept = [own];
          if (own === "Arial") s.accept.push("Helvetica / Arial");
          if (own === "Helvetica") s.accept.push("Arial");
        }
      let sets: Array<[string, Face[]]> = process.env.SCAN_FONT_BENCH_BASE14
        ? [
            ["base-14", []],
            ["+bundled", bundled],
          ]
        : [["+bundled", bundled]];
      if (device.length > 0) sets = [["+device", [...bundled, ...device]]];
      for (const [setName, faceSet] of sets) {
        setBundledScanFaces(faceSet);
        for (const [qualityName, opts] of qualities) {
          const { doc, page } = await buildScan(samples, opts);
          try {
            const started = performance.now();
            const picked = choicesByLine(doc, page, samples);
            const msPerLine = (performance.now() - started) / samples.length;
            let top1 = 0;
            let top3 = 0;
            let named = 0;
            let cls = 0;
            let weight = 0;
            samples.forEach((s, i) => {
              const choices = picked[i];
              const first = choices[0];
              if (s.accept.length > 0) {
                named++;
                if (first && s.accept.includes(first.face.label)) top1++;
                else
                  misses.push(
                    `${setName} ${qualityName}: ${s.family} "${s.text.slice(0, 12)}" -> ${first?.face.label ?? "none"} (${choices.map((c) => `${c.face.label} ${c.score.toFixed(3)}`).join(", ")})`,
                  );
                if (choices.some((c) => s.accept.includes(c.face.label)))
                  top3++;
              }
              if (first?.face.kind === s.kind) cls++;
              if (boldCut(first) === s.bold) weight++;
              else
                misses.push(
                  `${setName} ${qualityName}: ${s.family} weight -> ${first ? `${first.style.family} +${first.style.weight.toFixed(2)}pt` : "none"}`,
                );
            });
            const pct = (n: number, d: number) =>
              `${n}/${d}`.padStart(5) +
              ` ${Math.round((100 * n) / Math.max(1, d))}%`.padStart(5);
            rows.push(
              `${setName.padEnd(10)} | ${qualityName.padEnd(13)} | ${pct(top1, named).padEnd(10)} | ${pct(top3, named).padEnd(10)} | ${pct(cls, samples.length)} | ${pct(weight, samples.length)} | ${Math.round(msPerLine)}ms/line`,
            );
          } finally {
            doc.dispose();
          }
        }
      }
      await writeFile(
        process.env.SCAN_FONT_BENCH!,
        `${rows.join("\n")}\n\nmisses:\n${misses.join("\n")}\n`,
      );
    },
  );
});

type FontFile = [file: string, postscriptName: string];

const FUNKY: Array<[string, FontFile, FontFile | null]> = [
  ["Zapfino", ["Zapfino.ttf", ""], null],
  ["Brush Script", ["Brush Script.ttf", ""], null],
  [
    "Snell Roundhand",
    ["SnellRoundhand.ttc", "SnellRoundhand"],
    ["SnellRoundhand.ttc", "SnellRoundhand-Bold"],
  ],
  ["Savoye LET", ["Savoye LET.ttc", "SavoyeLetPlain"], null],
  [
    "SignPainter",
    ["SignPainter.ttc", "SignPainter-HouseScript"],
    ["SignPainter.ttc", "SignPainter-HouseScriptSemibold"],
  ],
  ["Apple Chancery", ["Apple Chancery.ttf", ""], null],
  ["Luminari", ["Luminari.ttf", ""], null],
  ["Trattatello", ["Trattatello.ttf", ""], null],
  ["Herculanum", ["Herculanum.ttf", ""], null],
  ["Chalkduster", ["Chalkduster.ttf", ""], null],
  ["Party LET", ["PartyLET-plain.ttf", ""], null],
  ["Bradley Hand", ["Bradley Hand Bold.ttf", ""], null],
  ["Comic Sans MS", ["Comic Sans MS.ttf", ""], ["Comic Sans MS Bold.ttf", ""]],
  [
    "Marker Felt",
    ["MarkerFelt.ttc", "MarkerFelt-Thin"],
    ["MarkerFelt.ttc", "MarkerFelt-Wide"],
  ],
  [
    "Noteworthy",
    ["Noteworthy.ttc", "Noteworthy-Light"],
    ["Noteworthy.ttc", "Noteworthy-Bold"],
  ],
  [
    "Chalkboard SE",
    ["ChalkboardSE.ttc", "ChalkboardSE-Regular"],
    ["ChalkboardSE.ttc", "ChalkboardSE-Bold"],
  ],
  ["Papyrus", ["Papyrus.ttc", "Papyrus"], null],
  ["Phosphate", ["Phosphate.ttc", "Phosphate-Solid"], null],
  ["Impact", ["Impact.ttf", ""], null],
  ["Arial Black", ["Arial Black.ttf", ""], null],
  [
    "Copperplate",
    ["Copperplate.ttc", "Copperplate"],
    ["Copperplate.ttc", "Copperplate-Bold"],
  ],
  ["Didot", ["Didot.ttc", "Didot"], ["Didot.ttc", "Didot-Bold"]],
  [
    "Bodoni 72",
    ["Bodoni 72.ttc", "BodoniSvtyTwoITCTT-Book"],
    ["Bodoni 72.ttc", "BodoniSvtyTwoITCTT-Bold"],
  ],
  [
    "Rockwell",
    ["Rockwell.ttc", "Rockwell-Regular"],
    ["Rockwell.ttc", "Rockwell-Bold"],
  ],
  ["Futura", ["Futura.ttc", "Futura-Medium"], ["Futura.ttc", "Futura-Bold"]],
  [
    "Gill Sans",
    ["GillSans.ttc", "GillSans"],
    ["GillSans.ttc", "GillSans-Bold"],
  ],
  ["Optima", ["Optima.ttc", "Optima-Regular"], ["Optima.ttc", "Optima-Bold"]],
  [
    "Palatino",
    ["Palatino.ttc", "Palatino-Roman"],
    ["Palatino.ttc", "Palatino-Bold"],
  ],
  [
    "Baskerville",
    ["Baskerville.ttc", "Baskerville"],
    ["Baskerville.ttc", "Baskerville-Bold"],
  ],
  ["Cochin", ["Cochin.ttc", "Cochin"], ["Cochin.ttc", "Cochin-Bold"]],
  [
    "Hoefler Text",
    ["Hoefler Text.ttc", "HoeflerText-Regular"],
    ["Hoefler Text.ttc", "HoeflerText-Black"],
  ],
  [
    "American Typewriter",
    ["AmericanTypewriter.ttc", "AmericanTypewriter"],
    ["AmericanTypewriter.ttc", "AmericanTypewriter-Bold"],
  ],
  [
    "Avenir Next",
    ["Avenir Next.ttc", "AvenirNext-Regular"],
    ["Avenir Next.ttc", "AvenirNext-Bold"],
  ],
  ["Andale Mono", ["Andale Mono.ttf", ""], null],
  ["Big Caslon", ["BigCaslon.ttf", ""], null],
  ["Skia", ["Skia.ttf", ""], null],
  ["Academy Engraved", ["Academy Engraved LET Fonts.ttf", ""], null],
];

function sentenceSlot(label: string): number {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

async function readFace([file, ps]: FontFile): Promise<Uint8Array | null> {
  for (const dir of [
    "/System/Library/Fonts/Supplemental/",
    "/System/Library/Fonts/",
  ]) {
    const raw = await readFile(dir + file).catch(() => null);
    if (raw) return fontFace(new Uint8Array(raw), ps || undefined);
  }
  return null;
}

async function systemFace(
  label: string,
  regular: FontFile,
  bold: FontFile | null,
): Promise<Face | null> {
  const regularBytes = await readFace(regular);
  if (!regularBytes) return null;
  const boldBytes = bold ? await readFace(bold) : null;
  registerFontBytes(label, regularBytes);
  if (boldBytes) registerFontBytes(`${label} Bold`, boldBytes);
  return faceFromBytes(
    { label, family: label, bold: `${label} Bold`, source: "device" },
    regularBytes,
    boldBytes,
  );
}

describe.skipIf(!process.env.SCAN_FONT_FUNKY)("funky font benchmark", () => {
  test(
    "reports what odd faces are read as",
    { timeout: 3_600_000 },
    async () => {
      const offered: Face[] = [];
      const truths: string[] = [];
      for (const [label, regular, bold] of FUNKY) {
        const face = await systemFace(label, regular, bold);
        if (!face) continue;
        offered.push(face);
        truths.push(label);
      }
      const samples: Sample[] = [0, 3].flatMap((offset) =>
        truths.map((label) => ({
          family: label,
          text: HELDOUT_SENTENCES[
            (sentenceSlot(label) + offset) % HELDOUT_SENTENCES.length
          ],
          size: 12,
          accept: [label],
          kind: "sans" as const,
          bold: false,
        })),
      );
      const opts: ScanOptions = { dpi: 200, blur: 0.6, noise: 8 };
      const rows: string[] = [];
      const sets: Array<[string, Face[]]> = [
        ["absent", bundled],
        ["offered", [...bundled, ...offered]],
      ];
      for (const [setName, faceSet] of sets) {
        setBundledScanFaces(faceSet);
        const { doc, page } = await buildScan(samples, opts);
        try {
          const picked = choicesByLine(doc, page, samples);
          let top1 = 0;
          let top3 = 0;
          samples.forEach((s, i) => {
            const choices = picked[i];
            if (choices[0]?.face.label === s.family) top1++;
            if (choices.some((c) => c.face.label === s.family)) top3++;
            rows.push(
              `${setName} | ${s.family.padEnd(20)} | ${s.text.slice(0, 14)} | ${choices.map((c) => `${c.face.label} ${Math.round(c.score * 100)}%`).join(", ") || "none"}`,
            );
          });
          rows.push(
            `${setName}: exact first ${top1}/${samples.length}, in top 3 ${top3}/${samples.length}`,
          );
        } finally {
          doc.dispose();
        }
      }
      await writeFile(process.env.SCAN_FONT_FUNKY!, `${rows.join("\n")}\n`);
    },
  );
});
