import { useCallback } from 'react';
import { thumbnailGenerationService } from '../services/thumbnailGenerationService';

/**
 * Hook for tools that want to use thumbnail generation
 * Tools can choose whether to include visual features
 */
export function useThumbnailGeneration() {
  const generateThumbnails = useCallback(async (
    pdfArrayBuffer: ArrayBuffer,
    pageNumbers: number[],
    options: {
      scale?: number;
      quality?: number;
      batchSize?: number;
      parallelBatches?: number;
    } = {},
    onProgress?: (progress: { completed: number; total: number; thumbnails: any[] }) => void
  ) => {
    return thumbnailGenerationService.generateThumbnails(
      pdfArrayBuffer,
      pageNumbers,
      options,
      onProgress
    );
  }, []);

  const addThumbnailToCache = useCallback((pageId: string, thumbnail: string) => {
    thumbnailGenerationService.addThumbnailToCache(pageId, thumbnail);
  }, []);

  const getThumbnailFromCache = useCallback((pageId: string): string | null => {
    return thumbnailGenerationService.getThumbnailFromCache(pageId);
  }, []);

  const getCacheStats = useCallback(() => {
    return thumbnailGenerationService.getCacheStats();
  }, []);

  const stopGeneration = useCallback(() => {
    thumbnailGenerationService.stopGeneration();
  }, []);

  const destroyThumbnails = useCallback(() => {
    thumbnailGenerationService.destroy();
  }, []);

  return {
    generateThumbnails,
    addThumbnailToCache,
    getThumbnailFromCache,
    getCacheStats,
    stopGeneration,
    destroyThumbnails
  };
}