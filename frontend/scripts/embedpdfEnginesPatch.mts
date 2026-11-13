import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin as EsbuildPlugin } from "esbuild";
import type { Plugin } from "vite";
// oxlint-disable-next-line no-restricted-imports -- scripts have no alias for this local patch
import { patchEmbedpdfFontFallback } from "./embedpdfFontFallbackPatch.mts";

const EXPECTED_VERSION = "2.15.1";
const PATCH_REVISION = "5";
const ENGINES_DIST =
  /[\\/]node_modules[\\/]@embedpdf[\\/]engines[\\/]dist[\\/]/;

interface Edit {
  from: string | RegExp;
  to: string;
}

interface PatchSite {
  name: string;
  edits: Edit[];
}

const RASTER_EDITS: PatchSite[] = [
  {
    name: "pdfium worker response",
    edits: [
      {
        from: `respond(response) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "Sending response:", response.type);
    self.postMessage(response);
  }`,
        to: `respond(response) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "Sending response:", response.type);
    const pixels = response.data?.data;
    const transfer = pixels instanceof Uint8ClampedArray && pixels.buffer instanceof ArrayBuffer ? [pixels.buffer] : [];
    self.postMessage(response, transfer);
  }`,
      },
    ],
  },
  {
    name: "encoder worker error reply",
    edits: [
      {
        from: `      data: {
        message: error instanceof Error ? error.message : String(error)
      }
    };
    self.postMessage(response);`,
        to: `      data: {
        message: error instanceof Error ? error.message : String(error),
        imageData: request.data.imageData
      }
    };
    self.postMessage(response, [request.data.imageData.data.buffer]);`,
      },
    ],
  },
  {
    name: "encoder pool rejection",
    edits: [
      {
        from: `      const errorData = response.data;
      task.reject(new Error(errorData.message));`,
        to: `      const errorData = response.data;
      task.reject(Object.assign(new Error(errorData.message), { imageData: errorData.imageData }));`,
      },
    ],
  },
  {
    name: "pdf engine raster copy",
    edits: [
      {
        from: `    const plainImageData = {
      data: new Uint8ClampedArray(rawImageData.data),
      width: rawImageData.width,
      height: rawImageData.height
    };
    this.options.imageConverter(() => plainImageData, imageType, quality)`,
        to: `    const plainImageData = {
      data: rawImageData.data,
      width: rawImageData.width,
      height: rawImageData.height
    };
    this.options.imageConverter(() => plainImageData, imageType, quality)`,
      },
    ],
  },
  {
    name: "encoder worker image data copy",
    edits: [
      {
        // ImageData keeps the provided view, so the extra copy only burns a
        // full-raster memcpy in the worker before putImageData copies again.
        from: `  const { data, width, height } = imageData;
  const imgData = new ImageData(new Uint8ClampedArray(data), width, height);`,
        to: `  const { data, width, height } = imageData;
  const imgData = new ImageData(data, width, height);`,
      },
    ],
  },
  {
    name: "hybrid image converter copy",
    edits: [
      {
        from: `    try {
      const dataCopy = new Uint8ClampedArray(pdfImage.data);
      return await workerPool.encode(
        {
          data: dataCopy,
          width: pdfImage.width,
          height: pdfImage.height
        },
        imageType,
        quality
      );
    } catch (error) {
      console.warn("Worker encoding failed, falling back to main-thread Canvas:", error);
      return browserImageDataToBlobConverter(getImageData, imageType, quality);
    }`,
        to: `    try {
      return await workerPool.encode(
        {
          data: pdfImage.data,
          width: pdfImage.width,
          height: pdfImage.height
        },
        imageType,
        quality
      );
    } catch (error) {
      console.warn("Worker encoding failed, falling back to main-thread Canvas:", error);
      const returned = error?.imageData ?? (pdfImage.data.byteLength > 0 ? pdfImage : void 0);
      if (!returned) throw error;
      return browserImageDataToBlobConverter(() => returned, imageType, quality);
    }`,
      },
    ],
  },
];

const escapeNewlines = (text: string) => text.replace(/\n/g, "\\n");
const fail = (file: string, reason: string): never => {
  throw new Error(
    `[embedpdf-engines] ${path.basename(file)}: ${reason}. ` +
      "Follow the upgrade steps at the top of " +
      "frontend/scripts/embedpdfEnginesPatch.mts.",
  );
};

let checkedVersion = false;
function assertPinnedVersion(file: string) {
  if (checkedVersion) return;
  const pkgDir =
    file.slice(0, file.search(ENGINES_DIST)) +
    "/node_modules/@embedpdf/engines";
  const version = JSON.parse(
    readFileSync(path.join(pkgDir, "package.json"), "utf8"),
  ).version;
  if (version !== EXPECTED_VERSION) {
    fail(
      file,
      `expected @embedpdf/engines@${EXPECTED_VERSION}, found ${version}`,
    );
  }
  checkedVersion = true;
}

/** Applies one anchor exactly once, escaping replacements inside worker source. */
function applyEdit(original: string, edit: Edit, file: string): string {
  if (edit.from instanceof RegExp) {
    const count = original.match(new RegExp(edit.from, "g"))?.length ?? 0;
    if (count !== 1) {
      fail(file, `expected one match for ${edit.from}, found ${count}`);
    }
    return original.replace(edit.from, edit.to);
  }

  const plainAt = original.indexOf(edit.from);
  const escapedFrom = escapeNewlines(edit.from);
  const escapedAt = plainAt === -1 ? original.indexOf(escapedFrom) : -1;
  const at = plainAt === -1 ? escapedAt : plainAt;
  if (at === -1) {
    fail(file, `expected one match for "${edit.from.slice(0, 50)}", found 0`);
  }
  const needle = plainAt === -1 ? escapedFrom : edit.from;
  if (original.indexOf(needle, at + 1) !== -1) {
    fail(
      file,
      `expected one match for "${edit.from.slice(0, 50)}", found many`,
    );
  }
  const inEscapedSource = original.startsWith("\\n", at + needle.length);
  const to = inEscapedSource ? escapeNewlines(edit.to) : edit.to;
  return original.slice(0, at) + to + original.slice(at + needle.length);
}

/** Patches the raster path in ESM `.js` dist files, or returns null. */
export function patchEmbedpdfRasterTransfer(
  code: string,
  file: string,
): string | null {
  if (!ENGINES_DIST.test(file) || !file.endsWith(".js")) return null;
  assertPinnedVersion(file);
  let out = code;
  let patched = false;
  for (const site of RASTER_EDITS) {
    const [primary] = site.edits;
    const present =
      primary.from instanceof RegExp
        ? primary.from.test(out)
        : out.includes(primary.from) ||
          out.includes(escapeNewlines(primary.from));
    if (!present) continue;
    patched = true;
    for (const edit of site.edits) {
      out = applyEdit(out, edit, file);
    }
  }
  return patched ? out : null;
}

export function patchEmbedpdfEngines(
  code: string,
  file: string,
): string | null {
  const fontPatched = patchEmbedpdfFontFallback(code, file);
  const rasterPatched = patchEmbedpdfRasterTransfer(fontPatched ?? code, file);
  return rasterPatched ?? fontPatched;
}

export function embedpdfEnginesPlugin(): Plugin {
  // esbuild runs only the first matching onLoad, so this prebundle applies both.
  const prebundle: EsbuildPlugin = {
    name: `embedpdf-engines-${PATCH_REVISION}`,
    setup(build) {
      build.onLoad(
        { filter: /[\\/]@embedpdf[\\/]engines[\\/]dist[\\/].*\.c?js$/ },
        (args) => {
          const patched = patchEmbedpdfEngines(
            readFileSync(args.path, "utf8"),
            args.path,
          );
          return patched === null
            ? undefined
            : { contents: patched, loader: "js" };
        },
      );
    },
  };
  return {
    name: `embedpdf-engines-${PATCH_REVISION}`,
    enforce: "pre",
    config: () => ({
      optimizeDeps: { esbuildOptions: { plugins: [prebundle] } },
    }),
    transform(code, id) {
      const patched = patchEmbedpdfEngines(code, id.split("?")[0]);
      return patched === null ? null : { code: patched, map: null };
    },
  };
}
