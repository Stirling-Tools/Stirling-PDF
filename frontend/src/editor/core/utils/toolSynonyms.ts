import { TFunction } from "i18next";

// Helper function to get synonyms for a tool (only from translations)
export const getSynonyms = (t: TFunction, toolId: string): string[] => {
  try {
    const candidateKeys = [`home.${toolId}.tags`, `${toolId}.tags`];
    const tags = candidateKeys
      .map((key) => ({ key, value: t(key) as unknown as string }))
      .find(({ key, value }) => value && value !== key)?.value;

    if (!tags) return [];

    return tags
      .split(",")
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
  } catch (error) {
    console.error(
      `[Tags] Failed to get translated synonyms for tool ${toolId}:`,
      error,
    );
    return [];
  }
};
