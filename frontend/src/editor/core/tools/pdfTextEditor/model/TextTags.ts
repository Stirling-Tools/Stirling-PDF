import { sameArtifactKind } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { TagMark } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";

/**
 * The tags each code unit of a text is drawn with, as stretches in order:
 * each runs from the previous one's end to its own. The last may end at
 * Infinity, giving its tags to every code unit after; a code unit past the
 * last stretch has none.
 */
export type TextTags = readonly TagStretch[];

export interface TagStretch {
  end: number;
  tags: readonly TagMark[];
}

/** A stretch of a text whose code units all have the same tags. */
export interface TaggedSpan {
  start: number;
  end: number;
  tags: readonly TagMark[];
}

export function uniformTags(tags: readonly TagMark[]): TextTags {
  return [{ end: Infinity, tags }];
}

export function tagsAt(text: TextTags, at: number): readonly TagMark[] {
  return text.find((stretch) => stretch.end > at)?.tags ?? [];
}

/** Code units `start` to `end` of `text`, numbered from `start`. */
export function sliceTags(
  text: TextTags,
  start: number,
  end: number,
): TextTags {
  const out: TagStretch[] = [];
  for (const stretch of text) {
    if (stretch.end <= start) continue;
    out.push({ end: Math.min(stretch.end, end) - start, tags: stretch.tags });
    if (stretch.end >= end) break;
  }
  return out;
}

/** `tail`'s stretches numbered from `offset`, after `head`'s. */
export function joinTags(
  head: TextTags,
  offset: number,
  tail: TextTags,
): TextTags {
  return [
    ...sliceTags(head, 0, offset),
    ...tail.map(({ end, tags }) => ({ end: end + offset, tags })),
  ];
}

/** The first `length` code units of `text` as spans, neighbours with the same tags joined. */
export function taggedSpans(text: TextTags, length: number): TaggedSpan[] {
  const out: TaggedSpan[] = [];
  let start = 0;
  for (const { end: stretchEnd, tags } of [
    ...text,
    { end: Infinity, tags: [] },
  ]) {
    const end = Math.min(stretchEnd, length);
    if (end <= start) continue;
    const last = out.at(-1);
    if (last && sameTags(last.tags, tags)) last.end = end;
    else out.push({ start, end, tags });
    start = end;
    if (start >= length) break;
  }
  return out;
}

/** `text` split at its line breaks, each line with its tags. */
export function splitLines(
  text: string,
  tags: TextTags,
): Array<{ text: string; tags: TextTags }> {
  const lines: Array<{ text: string; tags: TextTags }> = [];
  let start = 0;
  for (const lineBreak of text.matchAll(/\r?\n/g)) {
    lines.push({
      text: text.slice(start, lineBreak.index),
      tags: sliceTags(tags, start, lineBreak.index),
    });
    start = lineBreak.index + lineBreak[0].length;
  }
  lines.push({
    text: text.slice(start),
    tags: sliceTags(tags, start, Infinity),
  });
  return lines;
}

export function sameTags(
  a: readonly TagMark[],
  b: readonly TagMark[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (mark, i) =>
        mark.name === b[i].name &&
        mark.mcid === b[i].mcid &&
        sameArtifactKind(mark.artifact, b[i].artifact),
    )
  );
}
