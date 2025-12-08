import {
  ProcessedFileMetadata,
  ProcessedFilePage,
  StirlingFileStub,
} from '@app/types/fileContext';

export interface PageDimensions {
  width: number | null;
  height: number | null;
}

export function getPageDimensions(
  page?: ProcessedFilePage | null
): PageDimensions {
  const width =
    typeof page?.width === 'number' && page.width > 0 ? page.width : null;
  const height =
    typeof page?.height === 'number' && page.height > 0 ? page.height : null;

  return { width, height };
}

export function getFirstPageDimensionsFromMetadata(
  metadata?: ProcessedFileMetadata | null
): PageDimensions {
  if (!metadata?.pages?.length) {
    return { width: null, height: null };
  }

  return getPageDimensions(metadata.pages[0]);
}

export function getFirstPageDimensionsFromStub(
  file?: StirlingFileStub
): PageDimensions {
  return getFirstPageDimensionsFromMetadata(file?.processedFile);
}

export function getFirstPageAspectRatioFromMetadata(
  metadata?: ProcessedFileMetadata | null
): number | null {
  const { width, height } = getFirstPageDimensionsFromMetadata(metadata);
  if (width && height) {
    return height / width;
  }
  return null;
}

export function getFirstPageAspectRatioFromStub(
  file?: StirlingFileStub
): number | null {
  return getFirstPageAspectRatioFromMetadata(file?.processedFile);
}
