/**
 * Filters out emoji characters from a text string
 * @param text - The input text string
 * @returns The filtered text without emoji characters
 */
export const removeEmojis = (text: string): string => {
  // Filter out emoji characters (Unicode ranges for emojis)
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
};