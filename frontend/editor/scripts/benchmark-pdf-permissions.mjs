import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { init } from "@embedpdf/pdfium";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";

const module = await init({
  wasmBinary: await readFile(
    new URL(
      "../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm",
      import.meta.url,
    ),
  ),
});
module.PDFiumExt_Init();
const scratch = await mkdtemp(join(tmpdir(), "pdf-permission-benchmark-"));
if (
  !resolve(scratch).startsWith(
    resolve(tmpdir()) + sep + "pdf-permission-benchmark-",
  )
)
  throw new Error("Unexpected benchmark directory");
const results = [];
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

try {
  for (const [mib, pages, encrypted] of [
    [1, 1, false],
    [10, 1, false],
    [50, 1, false],
    [100, 1, false],
    [125, 1, false],
    [250, 1, false],
    [10, 1000, false],
    [1, 1, true],
    [125, 1, true],
  ]) {
    const pdf = await PDFDocument.create();
    for (let page = 0; page < pages; page++) pdf.addPage([300, 400]);
    // A referenced, uncompressed stream varies file size without varying the page tree or permissions.
    pdf.catalog.set(
      PDFName.of("BenchmarkPayload"),
      pdf.context.register(pdf.context.stream(new Uint8Array(mib * 1024 ** 2))),
    );
    if (encrypted)
      pdf.encrypt({
        userPassword: "",
        ownerPassword: "benchmark-owner",
        permissions: { copying: false, modifying: false, printing: false },
      });
    const filename = join(scratch, "sample.pdf");
    await writeFile(filename, await pdf.save({ useObjectStreams: false }));
    const samples = [];
    for (let repeat = 0; repeat < 5; repeat++) {
      const start = performance.now();
      const bytes = await readFile(filename);
      const read = performance.now();
      const ptr = module.pdfium.wasmExports.malloc(bytes.length);
      module.pdfium.HEAPU8.set(bytes, ptr);
      const copied = performance.now();
      const doc = module.FPDF_LoadMemDocument(ptr, bytes.length, "");
      const opened = performance.now();
      if (!doc)
        throw new Error(`PDFium open failed: ${module.FPDF_GetLastError()}`);
      try {
        const isEncrypted = module.EPDF_IsEncrypted(doc);
        module.EPDF_IsOwnerUnlocked(doc);
        module.FPDF_GetDocPermissions(doc);
        module.FPDF_GetDocUserPermissions(doc);
        const firstRead = performance.now();
        if (isEncrypted !== encrypted)
          throw new Error("Incorrect protection state");
        const iterations = 100_000;
        for (let i = 0; i < iterations; i++) {
          module.EPDF_IsEncrypted(doc);
          module.EPDF_IsOwnerUnlocked(doc);
          module.FPDF_GetDocPermissions(doc);
          module.FPDF_GetDocUserPermissions(doc);
        }
        const inspected = performance.now();
        samples.push({
          bytes: bytes.length,
          readMs: read - start,
          copyMs: copied - read,
          openMs: opened - copied,
          firstPermissionUs: (firstRead - opened) * 1000,
          permissionUs: ((inspected - firstRead) * 1000) / iterations,
        });
      } finally {
        module.FPDF_CloseDocument(doc);
        module.pdfium.wasmExports.free(ptr);
      }
    }
    results.push({
      payloadMiB: mib,
      pages,
      encrypted,
      bytes: samples[0].bytes,
      ...Object.fromEntries(
        ["readMs", "copyMs", "openMs", "firstPermissionUs", "permissionUs"].map(
          (key) => [key, median(samples.map((sample) => sample[key]))],
        ),
      ),
      samples,
    });
  }
  process.stdout.write(
    JSON.stringify(
      {
        node: process.version,
        pdfium: "2.15.1",
        repeats: 5,
        permissionCallsPerSample: 400_000,
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await rm(scratch, { recursive: true });
}
