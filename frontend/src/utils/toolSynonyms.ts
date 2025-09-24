import { TFunction } from 'i18next';

// Helper function to get synonyms for a tool (only from translations)
export const getSynonyms = (t: TFunction, toolId: string): string[] => {
  try {
    const tagsKey = `${toolId}.tags`;
    const tags = t(tagsKey) as unknown as string;

    // If the translation key doesn't exist or returns the key itself, return empty array
    if (!tags || tags === tagsKey) {
      return [];
    }

    // Split by comma and clean up the tags
    return tags
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
  } catch (error) {
    console.warn(`Failed to get translated synonyms for tool ${toolId}:`, error);
    return [];
  }};


