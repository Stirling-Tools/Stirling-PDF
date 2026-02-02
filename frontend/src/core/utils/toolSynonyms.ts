import { TFunction } from "i18next";

// Helper function to get synonyms for a tool (only from translations)
export const getSynonyms = (t: TFunction, toolId: string): string[] => {
  try {
    const candidateKeys = [`home.${toolId}.tags`, `${toolId}.tags`];
    let tags: string | undefined;
    let usedKey: string | undefined;

    for (const key of candidateKeys) {
      const value = t(key) as unknown as string;
      console.warn(`[Tags] Trying key "${key}" for tool "${toolId}": got value "${value}"`);
      if (value && value !== key) {
        tags = value;
        usedKey = key;
        break;
      }
    }

    if (!tags) {
      console.warn(`[Tags] Missing tags for tool: ${toolId}`);
      return [];
    }

    // Split by comma and clean up the tags
    const cleanedTags = tags
      .split(",")
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);

    // Log the tags found for this tool
    if (cleanedTags.length > 0) {
      console.info(`[Tags] Tool "${toolId}" (${usedKey}) has ${cleanedTags.length} tags:`, cleanedTags);
    } else {
      console.warn(`[Tags] Tool "${toolId}" has empty tags value`);
    }

    return cleanedTags;
  } catch (error) {
    console.error(`[Tags] Failed to get translated synonyms for tool ${toolId}:`, error);
    return [];
  }
};
