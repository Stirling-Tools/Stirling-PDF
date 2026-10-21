const NUMBER_TOKEN = "{n}";
// Mirrors SplitOutputNames.sanitize on the server: an illegal run beside a space
// is dropped (with one following space), any other illegal run becomes "_".
const ILLEGAL_BESIDE_SPACE = /(?<=\s)[/\\?%*:|"<>]+\s?|[/\\?%*:|"<>]+(?=\s)/g;
const ILLEGAL = /[/\\?%*:|"<>]/g;

/** The file name (without ".pdf") the server gives output `number` for `pattern`. */
export function applyNamePattern(pattern: string, number: number): string {
  const numbered = pattern.includes(NUMBER_TOKEN)
    ? pattern.replaceAll(NUMBER_TOKEN, String(number))
    : `${pattern.trim()} ${number}`;
  return numbered.replace(ILLEGAL_BESIDE_SPACE, "").replace(ILLEGAL, "_");
}

/** Two examples, not three: three overflow the Select input at the default panel width. */
export function describeNamePattern(pattern: string): string {
  return [1, 2].map((n) => applyNamePattern(pattern, n)).join(", ") + "…";
}
