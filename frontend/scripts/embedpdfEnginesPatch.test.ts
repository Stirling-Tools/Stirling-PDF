// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// oxlint-disable-next-line no-restricted-imports -- scripts have no alias for this local patch
import { patchEmbedpdfEngines } from "./embedpdfEnginesPatch.mts";

const enginesDist = new URL(
  "../node_modules/@embedpdf/engines/dist/",
  import.meta.url,
);

const patch = (relativePath: string) => {
  const file = fileURLToPath(new URL(relativePath, enginesDist));
  return patchEmbedpdfEngines(readFileSync(file, "utf8"), file);
};

describe("embedpdfEnginesPatch raster transfer", () => {
  it("transfers the page raster out of the PDFium worker", () => {
    const worker = patch("lib/pdfium/web/worker-engine.js");
    expect(worker).not.toBeNull();
    expect(worker).toContain("self.postMessage(response, transfer)");
    expect(worker).toContain(
      "pixels instanceof Uint8ClampedArray && pixels.buffer instanceof ArrayBuffer",
    );
  });

  it("hands the pixels back when the encoder worker fails", () => {
    const worker = patch("lib/pdfium/web/worker-engine.js");
    expect(worker).toContain("imageData: request.data.imageData");
    expect(worker).toContain(
      "self.postMessage(response, [request.data.imageData.data.buffer])",
    );
    expect(worker).toContain(
      "Object.assign(new Error(errorData.message), { imageData: errorData.imageData })",
    );
    expect(worker).toContain(
      "const imgData = new ImageData(data, width, height)",
    );
  });

  it("passes the received pixels through PdfEngine without copying", () => {
    const engine = patch("pdf-engine-D9v0RfKe.js");
    expect(engine).not.toBeNull();
    expect(engine).toContain("data: rawImageData.data");
    expect(
      engine?.match(/data: new Uint8ClampedArray\(rawImageData\.data\)/g),
    ).toHaveLength(1);
  });

  it("passes the pixels to the encoder pool without copying", () => {
    const converter = patch("browser-BKLM0ThC.js");
    expect(converter).not.toBeNull();
    expect(converter).toContain("data: pdfImage.data");
    expect(
      converter?.match(/new Uint8ClampedArray\(pdfImage\.data\)/g),
    ).toHaveLength(1);
    // Failed encode: use returned pixels, or the originals if none transferred.
    expect(converter).toContain(
      "const returned = error?.imageData ?? (pdfImage.data.byteLength > 0 ? pdfImage : void 0)",
    );
    expect(converter).toContain("if (!returned) throw error;");
    expect(converter).toContain(
      "browserImageDataToBlobConverter(() => returned, imageType, quality)",
    );
  });

  it("leaves an unrelated engines file alone", () => {
    expect(patch("index.js")).toBeNull();
  });
});
