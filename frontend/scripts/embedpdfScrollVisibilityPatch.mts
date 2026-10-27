// In-memory patch for the pinned @embedpdf/plugin-scroll, whose current page
// comes out one page late whenever two pages are nearly tied: page N after a
// navigation to N is recomputed as N + 1 by the next scroll, which the toolbar,
// Next/Previous and the bookmark form all read. Two causes, one edit each:
// - It scrolls to a page at its offset plus the viewport gap (the padding drawn
//   around the pages, 3.5rem here) but measures visibility without the gap.
// - Ties go to the lower page, but the scroll offset is rounded to device
//   pixels, so a page shown whole reads as 99.96% visible and loses the tie.
//
// Applied while Vite reads the package (bundling and the dev prebundle), never
// written to node_modules.
//
// Upgrading @embedpdf/plugin-scroll (any other version fails the build): check
// whether calculatePageVisibility offsets pages by viewportGap and
// determineCurrentPage tolerates rounding. Delete this file and its entry in
// vite.config.ts once both do; otherwise check each EDITS anchor still occurs
// once in dist/index.js, then update EXPECTED_VERSION and bump PATCH_REVISION.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin as EsbuildPlugin } from "esbuild";
import type { Plugin } from "vite";

const EXPECTED_VERSION = "2.15.1";
// Part of the plugin names, which feed Vite's dependency-prebundle hash: a
// change here rebuilds caches that hold the previous plugin code.
const PATCH_REVISION = "1";
const SCROLL_DIST =
  /[\\/]node_modules[\\/]@embedpdf[\\/]plugin-scroll[\\/]dist[\\/]index\.js$/;

// One percentage point is a pixel of rounding on a page down to 100px tall.
const EDITS: { from: string; to: string }[] = [
  {
    from: `        const itemX = (item.x + centeringOffsetX) * scale;
        const itemY = (item.y + centeringOffsetY) * scale;`,
    to: `        const itemX = (item.x + centeringOffsetX) * scale + this.viewportGap;
        const itemY = (item.y + centeringOffsetY) * scale + this.viewportGap;`,
  },
  {
    from: "const mostVisiblePages = visibilityMetrics.filter((m) => m.visiblePercentage === maxVisibility);",
    to: "const mostVisiblePages = visibilityMetrics.filter((m) => m.visiblePercentage >= maxVisibility - 1);",
  },
];

const fail = (file: string, reason: string): never => {
  throw new Error(
    `[embedpdf-scroll-visibility] ${path.basename(file)}: ${reason}. ` +
      "Follow the upgrade steps at the top of " +
      "frontend/scripts/embedpdfScrollVisibilityPatch.mts.",
  );
};

function assertPinnedVersion(file: string) {
  const pkgDir = path.resolve(path.dirname(file), "..");
  const version = JSON.parse(
    readFileSync(path.join(pkgDir, "package.json"), "utf8"),
  ).version;
  if (version !== EXPECTED_VERSION) {
    fail(
      file,
      `expected @embedpdf/plugin-scroll@${EXPECTED_VERSION}, found ${version}`,
    );
  }
}

/**
 * Returns the patched source of @embedpdf/plugin-scroll's ESM entry, or null for
 * any other file. Throws when the version is not the pinned one or an anchor
 * does not occur exactly once.
 */
export function patchEmbedpdfScrollVisibility(
  code: string,
  file: string,
): string | null {
  if (!SCROLL_DIST.test(file)) return null;
  assertPinnedVersion(file);
  let out = code;
  for (const edit of EDITS) {
    const count = out.split(edit.from).length - 1;
    if (count !== 1) {
      fail(
        file,
        `expected one match for "${edit.from.trim().slice(0, 50)}", found ${count}`,
      );
    }
    out = out.replace(edit.from, () => edit.to);
  }
  return out;
}

/** Applies the patch to bundled code and to Vite's dev prebundle. */
export function embedpdfScrollVisibilityPlugin(): Plugin {
  const prebundle: EsbuildPlugin = {
    name: `embedpdf-scroll-visibility-${PATCH_REVISION}`,
    setup(build) {
      build.onLoad(
        { filter: /[\\/]@embedpdf[\\/]plugin-scroll[\\/]dist[\\/]index\.js$/ },
        (args) => {
          const patched = patchEmbedpdfScrollVisibility(
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
    name: `embedpdf-scroll-visibility-${PATCH_REVISION}`,
    enforce: "pre",
    config: () => ({
      optimizeDeps: { esbuildOptions: { plugins: [prebundle] } },
    }),
    transform(code, id) {
      const patched = patchEmbedpdfScrollVisibility(code, id.split("?")[0]);
      return patched === null ? null : { code: patched, map: null };
    },
  };
}
