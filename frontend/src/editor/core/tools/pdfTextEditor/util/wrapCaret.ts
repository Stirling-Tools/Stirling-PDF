const WHITESPACE = /\s/;

/**
 * Where `offset` in `before` lands in `after`, a re-wrap of the same text that
 * may differ only in its whitespace. Counts the letters ahead of the offset and
 * then as many of the spaces between them and the offset as `after` still has
 * there, so a space turned into a line break leaves the caret after the same
 * letter.
 */
export function offsetAcrossRewrap(
  before: string,
  offset: number,
  after: string,
): number {
  let letters = 0;
  let trailingSpaces = 0;
  for (let i = 0; i < Math.min(offset, before.length); i += 1) {
    if (WHITESPACE.test(before[i])) trailingSpaces += 1;
    else {
      letters += 1;
      trailingSpaces = 0;
    }
  }
  let at = 0;
  while (letters > 0 && at < after.length) {
    if (!WHITESPACE.test(after[at])) letters -= 1;
    at += 1;
  }
  while (
    trailingSpaces > 0 &&
    at < after.length &&
    WHITESPACE.test(after[at])
  ) {
    trailingSpaces -= 1;
    at += 1;
  }
  return at;
}
