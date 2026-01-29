import { TFunction } from 'i18next';

// Helper function to get synonyms for a tool (only from translations)
export const getSynonyms = (t: TFunction, toolId: string): string[] => {
  try {
    const tagsKey = `${toolId}.tags`;
    const tags = t(tagsKey) as unknown as string;

    // If the translation key doesn't exist or returns the key itself, return empty array
    if (!tags || tags === tagsKey) {
      console.warn(`[Tags] Missing tags for tool: ${toolId}`);
      return [];
    }

    // Split by comma and clean up the tags
    const cleanedTags = tags
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);

    // Log the tags found for this tool
    if (cleanedTags.length > 0) {
      console.info(`[Tags] Tool "${toolId}" has ${cleanedTags.length} tags:`, cleanedTags);
    } else {
      console.warn(`[Tags] Tool "${toolId}" has empty tags value`);
    }

    return cleanedTags;
  } catch (error) {
    console.error(`[Tags] Failed to get translated synonyms for tool ${toolId}:`, error);
    return [];
  }};


