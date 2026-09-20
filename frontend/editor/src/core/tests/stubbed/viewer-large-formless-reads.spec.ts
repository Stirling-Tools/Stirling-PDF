// Regression for the large-document drop: a form-less document at or above
// LARGE_PDF_PARSE_LIMIT is probed once by the viewer's drop path (which seeds
// the per-document answer), so the form overlays must answer from the memo
// instead of reading the document back on the main thread.
//
// The fixture is generated (just over the limit) because a 100 MB file cannot
// be committed; the app only drops and seeds above that threshold.
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const LIMIT = 100 * 1024 * 1024;
const TARGET_BYTES = LIMIT + 2 * 1024 * 1024;
const FIXTURE = path.join(os.tmpdir(), `stirling-formless-${TARGET_BYTES}.pdf`);

/** Minimal single-page PDF whose content stream is comment padding, sized to
 *  targetBytes so it lands above the drop threshold. */
function buildFormlessPdf(targetBytes: number): Buffer {
  const line = `%${"x".repeat(78)}\n`;
  const object = (id: number, body: string) => `${id} 0 obj\n${body}\nendobj\n`;
  const entry = (offset: number, kind: "n" | "f") =>
    `${String(offset).padStart(10, "0")} ${kind === "n" ? "00000" : "65535"} ${kind} \n`;

  let padding = targetBytes;
  for (let pass = 0; pass < 4; pass += 1) {
    const chunks: Buffer[] = [];
    const offsets: number[] = [];
    let offset = 0;
    const push = (text: string | Buffer) => {
      const buffer = Buffer.isBuffer(text) ? text : Buffer.from(text, "latin1");
      chunks.push(buffer);
      offset += buffer.length;
      return offset;
    };

    push("%PDF-1.7\n");
    offsets[1] = push(object(1, "<</Type/Catalog/Pages 2 0 R>>"));
    offsets[2] = push(object(2, "<</Type/Pages/Kids[3 0 R]/Count 1>>"));
    offsets[3] = push(
      object(
        3,
        "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<<>>>>",
      ),
    );
    offsets[4] = push(`4 0 obj\n<</Length ${padding}>>\nstream\n`);
    const fullLines = Math.floor(padding / line.length);
    const remainder = padding - fullLines * line.length;
    push(Buffer.alloc(fullLines * line.length, line));
    if (remainder > 0) push(Buffer.from(line.slice(0, remainder), "latin1"));
    push("\nendstream\nendobj\n");

    const xrefOffset = offset;
    let xref = `xref\n0 5\n${entry(0, "f")}`;
    for (let id = 1; id <= 4; id += 1) xref += entry(offsets[id], "n");
    xref += `trailer\n<</Size 5/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    push(xref);

    const built = Buffer.concat(chunks);
    if (built.length === targetBytes) return built;
    padding += targetBytes - built.length;
  }
  throw new Error("could not size the generated fixture");
}

test.beforeAll(() => {
  if (!existsSync(FIXTURE)) {
    writeFileSync(FIXTURE, buildFormlessPdf(TARGET_BYTES));
  }
});

test("a large form-less document is not read back by the form overlays", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    Error.stackTraceLimit = 30;
    const reads: Array<{ size: number; stack: string }> = [];
    (window as unknown as { __blobReads: typeof reads }).__blobReads = reads;
    const real = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function patched(this: Blob) {
      const error = new Error();
      reads.push({
        size: this.size,
        stack: (error.stack ?? "")
          .split("\n")
          .slice(2, 12)
          .map((line) => line.trim())
          .join(" | "),
      });
      return real.call(this);
    };
  });

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("files-button").waitFor({ timeout: 45_000 });
  await page.locator('[data-testid="file-input"]').setInputFiles(FIXTURE);
  await page.locator('[data-page-index="0"]').first().waitFor({
    timeout: 120_000,
  });
  await page.waitForTimeout(6000);

  const reads = await page.evaluate(
    () =>
      (
        window as unknown as {
          __blobReads: Array<{ size: number; stack: string }>;
        }
      ).__blobReads,
  );
  const fullReads = reads.filter((read) => read.size >= LIMIT);
  expect(fullReads.length).toBeGreaterThanOrEqual(1);

  const overlayReads = fullReads.filter((read) =>
    /documentFormProbe|ButtonAppearanceOverlay|SignatureFieldOverlay|PdfiumFormProvider/.test(
      read.stack,
    ),
  );
  expect(overlayReads).toEqual([]);
});
