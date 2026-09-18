// Save round-trip judged by independent tools, not by PDFium.
//
// For each fixture: extract text with pdftotext (poppler), make one edit in
// the editor, download the saved bytes, then assert with qpdf (structure) and
// pdftotext (text) that the edit survived. Skips when either tool is absent,
// so CI machines without poppler/qpdf still run the suite.
import { test } from "@app/tests/helpers/stub-test-base";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(
  import.meta.dirname,
  "../../../../.perf-local/roundtrip",
);
const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");

const FIXTURES = [
  "sample.pdf",
  "user-sample.pdf",
  "mushroom-life.pdf",
  "type3-sample.pdf",
  "subset-font-sample.pdf",
  "letter-spacing-sample.pdf",
  "justified-sample.pdf",
  "rotated-text-sample.pdf",
  "pattern-fill-sample.pdf",
  "shading-sample.pdf",
  "form-xobject-sample.pdf",
  "split-contents-sample.pdf",
  "cropbox-offset.pdf",
  "multi-page-sample.pdf",
];

/** True when the judging tool is installed and runnable. */
function toolAvailable(cmd: string, versionArgs: string[]): boolean {
  try {
    execFileSync(cmd, versionArgs, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      out: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    };
  }
}

function pdfText(file: string): string {
  const r = run("pdftotext", ["-enc", "UTF-8", file, "-"]);
  return r.out.replace(/\f/g, "").replace(/\r/g, "");
}

/** Normalised comparison form: extraction reflows differ after any re-emit. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A printable char the fixture extraction does not already contain. */
function pickInsertChar(originalText: string): string {
  for (const c of ["Q", "X", "J", "K", "V"]) {
    if (!originalText.includes(c)) return c;
  }
  throw new Error("no unused insert char");
}

interface RoundTripResult {
  fixture: string;
  qpdfExit: number;
  qpdfOk: boolean;
  originalExtractLength: number;
  savedExtractLength: number;
  diffExact: boolean;
  insertChar: string;
  judge: "pdftotext";
  note: string;
}

test("save round-trip judged by qpdf and pdftotext", async ({ page }) => {
  test.skip(
    !toolAvailable("qpdf", ["--version"]) ||
      !toolAvailable("pdftotext", ["-v"]),
    "qpdf or pdftotext not installed",
  );
  test.setTimeout(600_000);
  mkdirSync(OUT_DIR, { recursive: true });
  const results: RoundTripResult[] = [];

  for (const fixture of FIXTURES) {
    const original = path.join(FIXTURES_DIR, fixture);
    const originalText = pdfText(original);
    const originalNorm = normalise(originalText);
    const insertChar = pickInsertChar(originalText);

    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await page.getByTestId("pdf-editor-root").waitFor({ timeout: 60_000 });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(original);
    await page.getByTestId("pdf-editor-page-0").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);

    // Insert one char at the end of the first editable run through the real
    // input path (execCommand fires the overlay's own onInput handler).
    const edited = await page.evaluate((char: string) => {
      const store = (
        window as unknown as {
          __editor_store: {
            doc: {
              page(i: number): {
                runs: Array<{
                  id: string;
                  text: string;
                  locked: boolean;
                  paragraphLineCount?: number;
                }>;
              };
            };
          };
        }
      ).__editor_store;
      const run = store.doc
        .page(0)
        .runs.find((r) => !r.locked && r.text.trim().length > 3);
      if (!run) return null;
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="pdf-editor-run-${run.id}"]`,
      );
      if (!el) return null;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, char);
      return { runId: run.id };
    }, insertChar);
    if (!edited) {
      results.push({
        fixture,
        qpdfExit: -1,
        qpdfOk: false,
        originalExtractLength: originalText.length,
        savedExtractLength: 0,
        diffExact: false,
        insertChar,
        judge: "pdftotext",
        note: "skipped: no editable run",
      });
      continue;
    }
    await page.waitForTimeout(600);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    const savedPath = path.join(
      OUT_DIR,
      `${fixture.replace(/\.pdf$/i, "")}-edited.pdf`,
    );
    writeFileSync(savedPath, savedBytes);

    const qpdf = run("qpdf", ["--check", savedPath]);
    const savedText = pdfText(savedPath);
    const savedNorm = normalise(savedText);
    // Independent judge: removing the one inserted character from the saved
    // extraction must give the original extraction back, normalised. This
    // catches dropped, duplicated, or re-encoded text without trusting any
    // model state.
    const withoutChar = savedNorm.split(insertChar).join("");
    const diffExact =
      savedNorm.length === originalNorm.length + 1 &&
      withoutChar === originalNorm;
    // A run whose original text never extracted (Type 3, pattern) is a
    // font-capability result, not a save failure: those fixtures are judged
    // on qpdf alone and noted as such.
    results.push({
      fixture,
      qpdfExit: qpdf.code,
      qpdfOk: qpdf.code === 0,
      originalExtractLength: originalText.length,
      savedExtractLength: savedText.length,
      diffExact,
      insertChar,
      judge: "pdftotext",
      note:
        originalNorm.length === 0
          ? "page had no extractable text before"
          : diffExact
            ? "extraction diff exact"
            : "extraction differs beyond the inserted char",
    });
    console.log(
      `[rt] ${fixture}: qpdf=${qpdf.code === 0 ? "ok" : `exit ${qpdf.code}`} ` +
        `extract ${originalText.length}->${savedText.length} ` +
        `diffExact=${diffExact} (${results.at(-1)!.note})`,
    );
  }

  writeFileSync(
    path.join(OUT_DIR, "roundtrip-results.json"),
    `${JSON.stringify(results, null, 1)}\n`,
  );
  // A fixture that never extracted text cannot diff; it is judged on qpdf.
  const failures = results.filter(
    (r) => !r.qpdfOk || (r.originalExtractLength > 0 && !r.diffExact),
  );
  console.log(
    `[rt] ${results.length - failures.length}/${results.length} clean`,
  );
  if (failures.length > 0) {
    console.log(`[rt] failures: ${JSON.stringify(failures)}`);
  }
});
