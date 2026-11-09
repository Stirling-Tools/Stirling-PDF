import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";

/** One object's text in a run, where it starts in the run's text, and the arrays listing it. */
export interface Leaf {
  run: TextRun;
  ptr: number;
  text: string;
  start: number;
  list: LeafList;
  index: number;
}

/** A run's parallel arrays for one line's objects. */
export interface LeafList {
  ptrs: number[];
  texts: string[];
  bounds: Array<{ x: number; right: number }>;
  charStarts: number[];
  /** Where the line starts in the run's text. */
  base: number;
}

export function lineList(run: TextRun): LeafList {
  return {
    ptrs: run.mergedFromPtrs,
    texts: run.mergedFromTexts,
    bounds: run.mergedFromBounds,
    charStarts: run.mergedFromCharStarts,
    base: 0,
  };
}

/** The run's objects in reading order; null when their texts do not tile the run's. */
export function leaves(run: TextRun): Leaf[] | null {
  const lists: LeafList[] =
    run.paragraphLineSlots.length > 0
      ? run.paragraphLineSlots.map((slot) => ({
          ptrs: slot.mergedFromPtrs,
          texts: slot.mergedFromTexts,
          bounds: slot.mergedFromBounds,
          charStarts: slot.mergedFromCharStarts,
          base: slot.startChar,
        }))
      : [lineList(run)];
  const out = lists.flatMap((list) =>
    list.ptrs.map((ptr, index) => ({
      run,
      ptr,
      text: list.texts[index] ?? "",
      start: list.base + (list.charStarts[index] ?? Number.NaN),
      list,
      index,
    })),
  );
  const tiles = out.every(
    (leaf, i) =>
      leaf.ptr !== 0 &&
      run.text.slice(leaf.start, leaf.start + leaf.text.length) === leaf.text &&
      (i === 0 || leaf.start >= out[i - 1].start + out[i - 1].text.length),
  );
  return out.length > 0 && tiles ? out : null;
}
