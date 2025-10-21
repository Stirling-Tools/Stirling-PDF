/**
 * Utilities for managing file resources and blob URLs
 */

import { useCallback } from 'react';
import { AUTOMATION_CONSTANTS } from '@app/constants/automation';

export class ResourceManager {
  private static blobUrls = new Set<string>();

  /**
   * Create a blob URL and track it for cleanup
   */
  static createBlobUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.blobUrls.add(url);
    return url;
  }

  /**
   * Revoke a specific blob URL
   */
  static revokeBlobUrl(url: string): void {
    if (this.blobUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.blobUrls.delete(url);
    }
  }

  /**
   * Revoke all tracked blob URLs
   */
  static revokeAllBlobUrls(): void {
    this.blobUrls.forEach(url => URL.revokeObjectURL(url));
    this.blobUrls.clear();
  }

  /**
   * Create a File with proper naming convention
   */
  static createResultFile(
    data: BlobPart, 
    originalName: string, 
    prefix: string = AUTOMATION_CONSTANTS.PROCESSED_FILE_PREFIX,
    type: string = 'application/pdf'
  ): File {
    return new File([data], `${prefix}${originalName}`, { type });
  }

  /**
   * Create a timestamped file for responses
   */
  static createTimestampedFile(
    data: BlobPart,
    prefix: string,
    extension: string = '.pdf',
    type: string = 'application/pdf'
  ): File {
    const timestamp = Date.now();
    return new File([data], `${prefix}${timestamp}${extension}`, { type });
  }
}

/**
 * Hook for automatic cleanup on component unmount
 */
export function useResourceCleanup(): () => void {
  return useCallback(() => {
    ResourceManager.revokeAllBlobUrls();
  }, []);
}