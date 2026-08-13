/**
 * Keep vector gradients when a page is regenerated.
 *
 * PDFium's content generator serialises text, paths and images. A shading
 * painted with the `sh` operator is none of those, so it is simply absent
 * from the regenerated stream - the gradient disappears from every page the
 * user edited, while the shading dictionaries and the resource names that
 * point at them survive untouched in the saved file.
 *
 * That asymmetry is the repair: re-derive the original draw operators from
 * the file as it was opened, and append them to the saved page as an extra
 * content stream. The names still resolve, so the gradients come back as
 * true vectors rather than a rasterised approximation.
 *
 * Rather than copying a byte range and hoping it is self-contained, the
 * original stream is replayed through a filter that keeps everything
 * affecting graphics state, neuters anything that would paint, and drops
 * text and XObjects entirely. What is left reproduces the exact state each
 * `sh` was drawn in, and paints nothing else.
 */
import {
  deflate,
  fromLatin1,
  toLatin1,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";
import {
  PATH_PAINTING,
  parseOps,
  TEXT_SHOWING,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/contentOps";
import { RawPdf, spliceValue } from "@app/tools/pdfTextEditor/v2/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  streamObject,
  type RevisionObject,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/revision";

const MARKED_CONTENT = new Set(["BDC", "BMC", "EMC", "MP", "DP"]);

export type ShadingPhase = "all" | "background" | "foreground";

interface ExtractedShading {
  /** Content-stream fragment that redraws every shading on the page. */
  content: string;
  /** Resource names the fragment depends on, by resource category. */
  needs: { shading: string[]; extGState: string[]; pattern: string[] };
  /** True when the first shading precedes any text on the page. */
  isBackground: boolean;
}

/**
 * Replay a page's content, keeping only what is needed to redraw its
 * shadings. Returns null when the page has none.
 */
export function extractShadingDraws(
  content: string,
  phase: ShadingPhase = "all",
): ExtractedShading | null {
  const ops = parseOps(content);
  const firstText = ops.findIndex((o) => TEXT_SHOWING.has(o.op));
  const wanted = (index: number): boolean => {
    if (phase === "all" || firstText < 0) return true;
    return phase === "background" ? index < firstText : index > firstText;
  };
  const shIndexes = ops
    .map((o, i) => (o.op === "sh" ? i : -1))
    .filter((i) => i >= 0 && wanted(i));
  if (shIndexes.length === 0) return null;

  const lastShading = shIndexes[shIndexes.length - 1];
  const shading: string[] = [];
  const extGState: string[] = [];
  const pattern: string[] = [];
  const out: string[] = [];
  let depth = 0;
  let inText = false;

  for (let i = 0; i <= lastShading; i += 1) {
    const op = ops[i];
    if (op.op === "BT") {
      inText = true;
      continue;
    }
    if (op.op === "ET") {
      inText = false;
      continue;
    }
    // Text positioning and font selection are scoped to the text object, so
    // nothing inside BT..ET can influence a shading drawn outside it.
    if (inText) continue;
    if (op.op === "BI" || op.op === "ID" || op.op === "EI") continue;
    // Marked content affects nothing a shading paints, and a BDC kept past
    // the last `sh` without its EMC would swallow the rest of the page into
    // an optional-content section.
    if (MARKED_CONTENT.has(op.op)) continue;
    // An XObject invocation could itself paint; the shadings it may contain
    // live in the form's own stream, which regeneration never rewrites.
    if (op.op === "Do") continue;
    if (op.op === "sh") {
      const name = op.operands[op.operands.length - 1];
      if (!name || name[0] !== "/") return null;
      // Out-of-phase shadings still contribute nothing but must not paint.
      if (!wanted(i)) continue;
      shading.push(name.slice(1));
      out.push(`${name} sh`);
      continue;
    }
    if (op.op === "gs") {
      const name = op.operands[op.operands.length - 1];
      // A malformed `gs` would otherwise emit the literal token "undefined".
      if (!name || name[0] !== "/") continue;
      extGState.push(name.slice(1));
      out.push(`${name} gs`);
      continue;
    }
    if (op.op === "scn" || op.op === "SCN") {
      const last = op.operands[op.operands.length - 1];
      if (last && last[0] === "/") pattern.push(last.slice(1));
      out.push(`${op.operands.join(" ")} ${op.op}`);
      continue;
    }
    if (PATH_PAINTING.has(op.op)) {
      // Keep the path - a preceding `W` may be using it as a clip - but end
      // it without painting, so only the shadings put ink on the page.
      out.push("n");
      continue;
    }
    if (op.op === "q") depth += 1;
    if (op.op === "Q") {
      if (depth === 0) continue;
      depth -= 1;
    }
    out.push(op.operands.length ? `${op.operands.join(" ")} ${op.op}` : op.op);
  }

  // The fragment is concatenated with content that assumes a clean state.
  for (let i = 0; i < depth; i += 1) out.push("Q");

  if (shading.length === 0) return null;
  return {
    content: `q\n${out.join("\n")}\nQ\n`,
    needs: {
      shading: [...new Set(shading)],
      extGState: [...new Set(extGState)],
      pattern: [...new Set(pattern)],
    },
    isBackground: firstText < 0 || shIndexes[0] < firstText,
  };
}

/** True when `resources` declares `name` under `/Category`. */
function resourceHasName(
  pdf: RawPdf,
  resources: string | null,
  category: string,
  name: string,
): boolean {
  if (!resources) return false;
  const sub = pdf.resolve(resources, category);
  if (!sub) return false;
  return new RegExp(`/${escapeName(name)}(?![^\\s/<>()\\[\\]{}%])`).test(sub);
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface PreserveShadingsOptions {
  /** Page indices that were regenerated and may have lost their shadings. */
  pages: number[];
}

/**
 * Re-inject shading draws into `savedBytes`, using `originalBytes` as the
 * source of truth. Returns null when nothing could be applied safely - the
 * caller keeps the saved bytes as they are.
 */
export async function preserveShadings(
  savedBytes: Uint8Array,
  originalBytes: Uint8Array,
  options: PreserveShadingsOptions,
): Promise<Uint8Array | null> {
  if (options.pages.length === 0) return null;
  const original = await RawPdf.parse(originalBytes);
  const saved = await RawPdf.parse(savedBytes);
  if (!original || !saved) return null;
  if (original.encrypted || saved.encrypted) return null;

  const objects: RevisionObject[] = [];
  let nextNum = saved.highestObjectNumber + 1;

  for (const pageIndex of [...new Set(options.pages)].sort((a, b) => a - b)) {
    const originalPageNum = original.pageNumberAt(pageIndex);
    const savedPageNum = saved.pageNumberAt(pageIndex);
    if (originalPageNum === null || savedPageNum === null) continue;

    const content = await original.pageContent(originalPageNum);
    if (!content) continue;
    const page = toLatin1(content);
    const savedBody = saved.objectBody(savedPageNum);
    if (!savedBody) continue;
    const resources = saved.pageInherited(savedPageNum, "Resources");
    const existing = saved.contentRefs(savedBody);
    if (existing.length === 0) continue;
    const span = saved.valueSpan(savedBody, "Contents");
    if (!span) continue;

    // Split by phase: a gradient that sat under the text goes back under it,
    // one that sat over it goes back over. A single fragment for the page put
    // mid-page shadings on the wrong side of the content.
    const before: number[] = [];
    const after: number[] = [];
    for (const phase of ["background", "foreground"] as const) {
      const extracted = extractShadingDraws(page, phase);
      if (!extracted) continue;
      const resolvable =
        extracted.needs.shading.every((n) =>
          resourceHasName(saved, resources, "Shading", n),
        ) &&
        extracted.needs.extGState.every((n) =>
          resourceHasName(saved, resources, "ExtGState", n),
        ) &&
        extracted.needs.pattern.every((n) =>
          resourceHasName(saved, resources, "Pattern", n),
        );
      if (!resolvable) continue;

      const raw = fromLatin1(extracted.content);
      const packed = await deflate(raw);
      const streamNum = nextNum;
      nextNum += 1;
      objects.push({
        num: streamNum,
        body: packed
          ? streamObject("<< /Filter /FlateDecode >>", packed)
          : streamObject("<< >>", raw),
      });
      (phase === "background" ? before : after).push(streamNum);
    }
    if (before.length === 0 && after.length === 0) continue;

    const order = [...before, ...existing, ...after];
    const array = `[${order.map((n) => `${n} 0 R`).join(" ")}]`;
    objects.push({
      num: savedPageNum,
      body: plainObject(spliceValue(savedBody, span, array)),
    });
  }

  if (objects.length === 0) return null;
  return appendRevision(saved, objects);
}
