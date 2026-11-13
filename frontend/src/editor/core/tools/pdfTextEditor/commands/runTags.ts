import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  readObjTexts,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { diffSpan } from "@editor/tools/pdfTextEditor/commands/partialEdit";
import { leaves } from "@editor/tools/pdfTextEditor/commands/runLeaves";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  joinTags,
  sameTags,
  sliceTags,
  taggedSpans,
  tagsAt,
  uniformTags,
  type TagStretch,
  type TextTags,
} from "@editor/tools/pdfTextEditor/model/TextTags";
import {
  innermostMcid,
  readTagMarks,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";

/** Where one of a run's objects draws in the run's text. */
interface ObjectSpan {
  ptr: number;
  start: number;
  text: string;
}

/**
 * The tags each code unit of `run.text` is drawn with, read from the objects
 * drawing it. A space between two objects of one element is that element's;
 * between an element inside the block and the block's own text, the block's.
 * The run's own tags for all of it when its objects agree, or cannot be
 * placed in its text.
 */
export function readRunTags(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): TextTags {
  const uniform = uniformTags(run.tagMarks);
  // A form's marks resolve against the form's own /StructParents, so they
  // would mis-tag the page-level objects an edit draws.
  const containers = [...collectContainersByPtr(run).values()];
  if (run.containerPtr !== 0 || containers.some(Boolean)) return uniform;
  const m = doc.module;
  const ptrs = collectMemberPtrs(run).filter(Boolean);
  const marks = new Map(ptrs.map((ptr) => [ptr, readTagMarks(m, ptr)]));
  const [first] = marks.values();
  if (!first || [...marks.values()].every((tags) => sameTags(tags, first))) {
    return uniform;
  }
  const spans: readonly ObjectSpan[] | null =
    leaves(run) ?? drawnSpans(m, page, run, ptrs);
  if (!spans) return uniform;
  const tagsOf = (span: ObjectSpan) =>
    marks.get(span.ptr) ?? readTagMarks(m, span.ptr);
  return spans.flatMap((span, i): TagStretch[] => {
    const tags = tagsOf(span);
    const next = spans[i + 1];
    if (!next) return [{ end: Infinity, tags }];
    const own = { end: span.start + span.text.length, tags };
    const nextTags = tagsOf(next);
    const gap = sameTags(tags, nextTags)
      ? tags
      : blockSide(doc, page.index, tags, nextTags);
    return [own, { end: next.start, tags: gap }];
  });
}

/**
 * Where each object draws, read back from the page, for a run whose own
 * lists no longer say: an edit that redrew it whole keeps only its objects.
 */
function drawnSpans(
  m: WrappedPdfiumModule,
  page: Page,
  run: TextRun,
  ptrs: number[],
): ObjectSpan[] | null {
  const texts = readObjTexts(m, page.pagePtr, ptrs);
  const spans: ObjectSpan[] = [];
  let cursor = 0;
  for (const [i, ptr] of ptrs.entries()) {
    const text = texts[i]?.trim();
    if (!text) continue;
    const start = run.text.indexOf(text, cursor);
    if (start < 0) return null;
    spans.push({ ptr, start, text });
    cursor = start + text.length;
  }
  return spans.length > 0 ? spans : null;
}

/**
 * The tags `nextText` is drawn with when it replaces `prevText`, which is
 * drawn with `prev`. Text the edit keeps will keep its tags. New text takes
 * those of the text it replaced when that was one element's, else those of
 * the text before it, but where an element inside the block meets the
 * block's own text, the block's: typing after a link does not extend it.
 * `fallback` tags new text with nothing either side.
 */
export function editedTags(
  doc: EditorDocument,
  pageIndex: number,
  prev: TextTags,
  prevText: string,
  nextText: string,
  fallback: readonly TagMark[],
): TextTags {
  const spans = taggedSpans(prev, prevText.length);
  if (spans.length <= 1) return uniformTags(spans[0]?.tags ?? fallback);
  const { start, prevEnd, nextEnd } = diffSpan(prevText, nextText);
  const inserted =
    nextEnd > start
      ? [
          {
            end: nextEnd - start,
            tags:
              insertedTags(doc, pageIndex, prev, prevText, start, prevEnd) ??
              fallback,
          },
        ]
      : [];
  return joinTags(
    joinTags(sliceTags(prev, 0, start), start, inserted),
    nextEnd,
    sliceTags(prev, prevEnd, Infinity),
  );
}

function insertedTags(
  doc: EditorDocument,
  pageIndex: number,
  prev: TextTags,
  prevText: string,
  start: number,
  prevEnd: number,
): readonly TagMark[] | null {
  const replaced = taggedSpans(
    sliceTags(prev, start, prevEnd),
    prevEnd - start,
  );
  if (replaced.length === 1) return replaced[0].tags;
  const before = start > 0 ? tagsAt(prev, start - 1) : null;
  const after = prevEnd < prevText.length ? tagsAt(prev, prevEnd) : null;
  if (!before || !after) return before ?? after;
  return blockSide(doc, pageIndex, before, after);
}

/**
 * The tags of text between `before` and `after`: `after` when only `before`
 * marks an element inside the block, as a link inside a paragraph, else
 * `before`.
 */
function blockSide(
  doc: EditorDocument,
  pageIndex: number,
  before: readonly TagMark[],
  after: readonly TagMark[],
): readonly TagMark[] {
  const insideBlock = (tags: readonly TagMark[]) => {
    const mcid = innermostMcid(tags);
    const element =
      mcid === null ? null : doc.structure(pageIndex).element(mcid);
    return element !== null && element.key !== element.block.key;
  };
  return insideBlock(before) && !insideBlock(after) ? after : before;
}
