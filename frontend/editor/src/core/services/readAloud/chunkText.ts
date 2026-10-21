/**
 * The browser speech engine cuts long utterances off (Chrome stops around 15
 * seconds of audio), so read-aloud speaks one bounded chunk at a time.
 * 180 characters is roughly 25–30 words: long enough to sound natural, short
 * enough to stay under the cutoff in every supported engine.
 */
export const MAX_SPEECH_CHUNK_CHARS = 180;

export interface SpeechChunk {
  text: string;
  /** Index of the chunk's first character in the page's spoken text. */
  startChar: number;
  /** Exclusive. */
  endChar: number;
}

interface CharRange {
  start: number;
  end: number;
}

/**
 * Split a page into speakable chunks at sentence boundaries where possible.
 *
 * `startChar`/`endChar` point into the original string so word highlighting can
 * map an utterance boundary back to the page without rebuilding offsets.
 */
export function chunkTextForSpeech(
  text: string,
  maxChars: number = MAX_SPEECH_CHUNK_CHARS,
): SpeechChunk[] {
  if (text.trim().length === 0) return [];

  const chunks: SpeechChunk[] = [];
  for (const sentence of sentenceRanges(text)) {
    for (const piece of splitLongRange(text, sentence, maxChars)) {
      const trimmed = trimRange(text, piece);
      if (trimmed == null) continue;
      const chunkText = text.slice(trimmed.start, trimmed.end);
      if (chunkText.trim().length === 0) continue;
      chunks.push({
        text: chunkText,
        startChar: trimmed.start,
        endChar: trimmed.end,
      });
    }
  }
  return chunks;
}

/** Index of the chunk containing `charIndex`; the last chunk when past the end. */
export function chunkIndexForChar(
  chunks: readonly SpeechChunk[],
  charIndex: number,
): number {
  if (chunks.length === 0) return 0;
  for (let i = 0; i < chunks.length; i++) {
    if (charIndex < chunks[i].endChar) return i;
  }
  return chunks.length - 1;
}

/** -1 when `charIndex` falls on the space between two words. */
export function wordIndexAtChar(words: string[], charIndex: number): number {
  let wordStart = 0;
  for (let i = 0; i < words.length; i++) {
    const wordEnd = wordStart + words[i].length;
    if (charIndex < wordEnd) return charIndex >= wordStart ? i : -1;
    wordStart = wordEnd + 1;
  }
  return -1;
}

function sentenceRanges(text: string): CharRange[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "sentence",
    });
    return Array.from(segmenter.segment(text), (part) => ({
      start: part.index,
      end: part.index + part.segment.length,
    }));
  }
  return fallbackSentenceRanges(text);
}

function fallbackSentenceRanges(text: string): CharRange[] {
  const ranges: CharRange[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.!?…]/.test(text[i])) continue;
    const end = i + 1;
    if (end < text.length && !/\s/.test(text[end])) continue;
    ranges.push({ start, end });
    start = end;
    i = end - 1;
  }
  if (start < text.length) ranges.push({ start, end: text.length });
  return ranges;
}

function splitLongRange(
  text: string,
  range: CharRange,
  maxChars: number,
): CharRange[] {
  const out: CharRange[] = [];
  let start = range.start;
  while (start < range.end) {
    const remaining = range.end - start;
    if (remaining <= maxChars) {
      out.push({ start, end: range.end });
      break;
    }
    const breakAt = findBreak(text, start, range.end, maxChars);
    out.push({ start, end: breakAt });
    start = breakAt;
  }
  return out;
}

/**
 * Prefer punctuation, then a space, then a hard cut. A hard cut only happens
 * for unspaced scripts or a single huge token, where there is no better break.
 */
function findBreak(
  text: string,
  start: number,
  end: number,
  maxChars: number,
): number {
  const limit = Math.min(start + maxChars, end);
  const minimum = start + Math.floor(maxChars * 0.4);
  for (let i = limit - 1; i >= minimum; i--) {
    if (/[.!?…;:,]/.test(text[i])) return i + 1;
  }
  const space = text.lastIndexOf(" ", limit - 1);
  if (space >= minimum) return space + 1;
  return limit;
}

function trimRange(text: string, range: CharRange): CharRange | null {
  let start = range.start;
  let end = range.end;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start === end ? null : { start, end };
}
