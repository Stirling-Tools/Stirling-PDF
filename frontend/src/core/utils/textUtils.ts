/**
 * Truncates text from the centre, preserving the start and end.
 * e.g. "very-long-filename.pdf" -> "very-lo...ame.pdf"
 */
export function truncateCenter(text: string, maxLength: number = 25): string {
  if (text.length <= maxLength) return text;
  const ellipsis = "...";
  const charsToShow = maxLength - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return (
    text.substring(0, frontChars) +
    ellipsis +
    text.substring(text.length - backChars)
  );
}

/**
 * Filters out emoji characters from a text string
 * @param text - The input text string
 * @returns The filtered text without emoji characters
 */
export const removeEmojis = (text: string): string => {
  // Filter out emoji characters (Unicode ranges for emojis)
  return text.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
    "",
  );
};
