const NUMBER_TOKEN = "{n}";
const ILLEGAL_CHAR = String.raw`[/\\?%*:|"<>]`;

// "Report / Summary": the run and one space after it go, leaving "Report Summary".
const ILLEGAL_RUN_AFTER_SPACE = String.raw`(?<=\s)${ILLEGAL_CHAR}+\s?`;

// "Chapter: 1": the run goes, leaving "Chapter 1". The (?<!...) guard lets a match
// start only on a run's first character. Without it the engine retries from every
// character of a run with no space after it, which is quadratic on long input.
const ILLEGAL_RUN_BEFORE_SPACE = String.raw`(?<!${ILLEGAL_CHAR})${ILLEGAL_CHAR}+(?=\s)`;

// Must stay in sync with SplitOutputNames.sanitize on the server, which names the
// files: a run touching a space is dropped, any other illegal character becomes "_".
const ILLEGAL_RUN_TOUCHING_SPACE = new RegExp(
  `${ILLEGAL_RUN_AFTER_SPACE}|${ILLEGAL_RUN_BEFORE_SPACE}`,
  "g",
);
const ILLEGAL = new RegExp(ILLEGAL_CHAR, "g");

/** The file name (without ".pdf") the server gives output `number` for `pattern`. */
export function applyNamePattern(pattern: string, number: number): string {
  const numbered = pattern.includes(NUMBER_TOKEN)
    ? pattern.replaceAll(NUMBER_TOKEN, String(number))
    : `${pattern.trim()} ${number}`;
  return numbered.replace(ILLEGAL_RUN_TOUCHING_SPACE, "").replace(ILLEGAL, "_");
}

/** Two examples, not three: three overflow the Select input at the default panel width. */
export function describeNamePattern(pattern: string): string {
  return [1, 2].map((n) => applyNamePattern(pattern, n)).join(", ") + "…";
}
