import { StorageStats } from "../services/fileStorage";
import { FileWithUrl } from "../types/file";

/**
 * Storage operation types for incremental updates
 */
export type StorageOperation = 'add' | 'remove' | 'clear';

/**
 * Update storage stats incrementally based on operation
 */
export function updateStorageStatsIncremental(
  currentStats: StorageStats,
  operation: StorageOperation,
  files: FileWithUrl[] = []
): StorageStats {
  const filesSizeTotal = files.reduce((total, file) => total + file.size, 0);
  
  switch (operation) {
    case 'add':
      return {
        ...currentStats,
        used: currentStats.used + filesSizeTotal,
        available: currentStats.available - filesSizeTotal,
        fileCount: currentStats.fileCount + files.length
      };
      
    case 'remove':
      return {
        ...currentStats,
        used: Math.max(0, currentStats.used - filesSizeTotal),
        available: currentStats.available + filesSizeTotal,
        fileCount: Math.max(0, currentStats.fileCount - files.length)
      };
      
    case 'clear':
      return {
        ...currentStats,
        used: 0,
        available: currentStats.quota || currentStats.available,
        fileCount: 0
      };
      
    default:
      return currentStats;
  }
}

/**
 * Check storage usage and return warning message if needed
 */
export function checkStorageWarnings(stats: StorageStats): string | null {
  if (!stats.quota || stats.used === 0) return null;
  
  const usagePercent = (stats.used / stats.quota) * 100;
  
  if (usagePercent > 90) {
    return 'Warning: Storage is nearly full (>90%). Browser may start clearing data.';
  } else if (usagePercent > 80) {
    return 'Storage is getting full (>80%). Consider removing old files.';
  }
  
  return null;
}

/**
 * Calculate storage usage percentage
 */
export function getStorageUsagePercent(stats: StorageStats): number {
  return stats.quota ? (stats.used / stats.quota) * 100 : 0;
}