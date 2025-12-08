import { useState, useEffect, useCallback } from 'react';
import { ToolId } from '@app/types/toolId';

const RECENT_TOOLS_KEY = 'stirlingpdf.recentTools';
const FAVORITE_TOOLS_KEY = 'stirlingpdf.favoriteTools';

export function useToolHistory() {
  const [recentTools, setRecentTools] = useState<ToolId[]>([]);
  const [favoriteTools, setFavoriteTools] = useState<ToolId[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const recentStr = window.localStorage.getItem(RECENT_TOOLS_KEY);
    const favoritesStr = window.localStorage.getItem(FAVORITE_TOOLS_KEY);

    if (recentStr) {
      try {
        const recent = JSON.parse(recentStr) as ToolId[];
        setRecentTools(recent);
      } catch {
        // Ignore parse errors
      }
    }

    if (favoritesStr) {
      try {
        const favorites = JSON.parse(favoritesStr) as ToolId[];
        setFavoriteTools(favorites);
      } catch {
        // Ignore parse errors
      }
    }
  }, []);


  // Toggle favorite status
  const toggleFavorite = useCallback((toolId: ToolId) => {
    if (typeof window === 'undefined') {
      return;
    }

    setFavoriteTools((prev) => {
      const isFavorite = prev.includes(toolId);
      const updated = isFavorite
        ? prev.filter((id) => id !== toolId)
        : [...prev, toolId];
      window.localStorage.setItem(FAVORITE_TOOLS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Check if a tool is favorited
  const isFavorite = useCallback(
    (toolId: ToolId): boolean => {
      return favoriteTools.includes(toolId);
    },
    [favoriteTools]
  );

  return {
    recentTools,
    favoriteTools,
    toggleFavorite,
    isFavorite,
  };
}
