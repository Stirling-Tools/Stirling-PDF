/**
 * Reading what a file's own artifacts are. PDFium reports that an artifact's
 * /Type is a name but cannot return it, so the page's content is read
 * alongside and its artifact sequences paired, in order, with the marks
 * PDFium made of them. A page whose sequences do not pair one to one is left
 * unread rather than guessed at.
 */
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { ArtifactKind } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  artifactSequences,
  type ArtifactSequence,
} from "@editor/tools/pdfTextEditor/pdfdoc/artifactSequences";
import type { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  ARTIFACT_TAG,
  readTagMarks,
  type ArtifactMarkRef,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/**
 * The kinds of the marks `refs`, as page `pageNum` of `pdf` names them, by
 * mark pointer. Null when its content cannot be read or does not pair with
 * `refs`.
 */
export async function readFileArtifactKinds(
  pdf: RawPdf,
  pageNum: number,
  refs: readonly ArtifactMarkRef[],
): Promise<Map<number, ArtifactKind> | null> {
  const sequences = await artifactSequences(pdf, pageNum);
  return sequences && pairArtifactKinds(refs, sequences);
}

/**
 * Each mark's kind from the sequence at its place in order; null unless
 * they pair one to one, each pair with as many entries and both naming a
 * /Subtype or neither.
 */
export function pairArtifactKinds(
  refs: readonly ArtifactMarkRef[],
  sequences: readonly ArtifactSequence[],
): Map<number, ArtifactKind> | null {
  if (refs.length !== sequences.length) return null;
  const kinds = new Map<number, ArtifactKind>();
  for (const [i, ref] of refs.entries()) {
    const { kind, entries } = sequences[i];
    if (ref.entries !== entries || ref.subtyped !== (kind.subtype !== null)) {
      return null;
    }
    kinds.set(ref.ptr, kind);
  }
  return kinds;
}

/**
 * Give the page's runs the kinds of their artifact marks, read after the
 * runs were: each takes the tags of a member drawn with the ones it has.
 */
export function refreshArtifactTags(m: WrappedPdfiumModule, page: Page): void {
  for (const run of page.runs) {
    const unread = run.tagMarks.some(
      (tag) => tag.name === ARTIFACT_TAG && !tag.artifact,
    );
    if (!unread || run.containerPtr !== 0) continue;
    for (const ptr of collectMemberPtrs(run)) {
      const tags = readTagMarks(m, ptr);
      if (sameMarks(tags, run.tagMarks)) {
        run.tagMarks = tags;
        break;
      }
    }
  }
}

/** Equal tags, kinds aside. */
function sameMarks(a: readonly TagMark[], b: readonly TagMark[]): boolean {
  return (
    a.length === b.length &&
    a.every((tag, i) => tag.name === b[i].name && tag.mcid === b[i].mcid)
  );
}
