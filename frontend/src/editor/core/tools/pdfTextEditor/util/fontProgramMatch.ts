import { readTableDirectory } from "@editor/tools/pdfTextEditor/util/sfnt";
import {
  charAdvances,
  glyphRangeReader,
  type GlyphRange,
} from "@editor/tools/pdfTextEditor/util/fontMetrics";

/** Whether two font files are the same typeface; `unknown` when they gave too little to compare. */
export type FontProgramMatch = "same" | "different" | "unknown";

const MIN_GLYPHS_FOR_VERDICT = 3; // fewer agree by chance too easily
const MAX_GLYPHS_COMPARED = 64; // a verdict by then; a CJK font holds thousands
const ADVANCE_TOLERANCE = 1; // thousandths of an em: rounding both to that grid alone opens a gap of one
const AGREEING_SHARE = 0.9; // a revision of the same face may change a few widths

interface Program {
  bytes: Uint8Array;
  glyphCount: number;
  glyph: ((gid: number) => GlyphRange | null) | null;
}

function readProgram(bytes: Uint8Array): Program | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const t = readTableDirectory(dv);
  const maxp = t?.get("maxp");
  if (!t || !maxp) return null;
  return {
    bytes,
    glyphCount: dv.getUint16(maxp.offset + 4),
    glyph: glyphRangeReader(dv, t),
  };
}

function outlineOf(program: Program, gid: number): Uint8Array | null {
  const range = program.glyph?.(gid);
  if (!range) return null;
  let end = range.end;
  // Glyph records are padded to a word boundary, and not every writer pads alike.
  while (end > range.start && program.bytes[end - 1] === 0) end--;
  return end > range.start ? program.bytes.subarray(range.start, end) : null;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// A subset that renumbers glyph ids proves nothing either way, so only agreement is a verdict.
function outlinesAtSameIds(embedded: Program, candidate: Program): boolean {
  if (!embedded.glyph || !candidate.glyph) return false;
  let compared = 0;
  for (let gid = 1; gid < embedded.glyphCount; gid++) {
    const glyph = outlineOf(embedded, gid);
    if (!glyph) continue;
    const other = outlineOf(candidate, gid);
    if (!other || !sameBytes(glyph, other)) return false;
    if (++compared >= MAX_GLYPHS_COMPARED) break;
  }
  return compared >= MIN_GLYPHS_FOR_VERDICT;
}

function advancesByCharacter(
  embedded: Uint8Array,
  candidate: Uint8Array,
): FontProgramMatch {
  const ours = charAdvances(embedded);
  const theirs = charAdvances(candidate);
  if (!ours || !theirs) return "unknown";
  let compared = 0;
  let agreeing = 0;
  for (const [codePoint, a] of ours) {
    const b = theirs.get(codePoint);
    // A subset can leave a mapped glyph empty with no width to compare.
    if (b === undefined || a === 0) continue;
    compared++;
    if (Math.abs(a - b) <= ADVANCE_TOLERANCE) agreeing++;
    if (compared >= MAX_GLYPHS_COMPARED) break;
  }
  if (compared < MIN_GLYPHS_FOR_VERDICT) return "unknown";
  return agreeing >= compared * AGREEING_SHARE ? "same" : "different";
}

/** Same outlines at the same glyph ids settle it; else shared characters' widths decide, accepting a metric-compatible face and rejecting a mere namesake. */
export function compareFontPrograms(
  embedded: Uint8Array,
  candidate: Uint8Array,
): FontProgramMatch {
  try {
    const ours = readProgram(embedded);
    const theirs = readProgram(candidate);
    if (!ours || !theirs) return "unknown";
    if (outlinesAtSameIds(ours, theirs)) return "same";
    return advancesByCharacter(embedded, candidate);
  } catch {
    return "unknown";
  }
}
