import { useEffect, useMemo, useRef, useState } from 'react';
import { useMorphElement } from '@app/hooks/useMorphElement';
import { useViewer } from '@app/contexts/ViewerContext';
import { useThumbnailGeneration } from '@app/hooks/useThumbnailGeneration';

interface ViewerPageMorphsProps {
  fileId?: string;
  file?: File | null;
}

interface PageMorphProps {
  fileId: string;
  pageNumber: number;
  indexOffset: number;
  thumbnail?: string;
}

function ViewerPageMorph({ fileId, pageNumber, indexOffset, thumbnail }: PageMorphProps) {
  const morphId = `page-${fileId}-${pageNumber}`;
  const ref = useMorphElement<HTMLDivElement>(
    morphId,
    { fileId, type: 'page', pageNumber, thumbnail },
    { onlyIn: ['viewer'] }
  );

  return (
    <div
      key={morphId}
      ref={ref}
      data-morph-id={morphId}
      data-morph-file-id={fileId}
      data-morph-page-number={pageNumber}
      data-morph-type="page"
      style={{
        position: 'fixed',
        left: '50%',
        top: `${40 + indexOffset * 26}%`,
        width: '140px',
        height: '180px',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        opacity: 0,
        borderRadius: '4px',
        background: 'transparent',
        zIndex: 5,
      }}
    />
  );
}

/**
 * Registers the currently visible pages in the viewer for morph animations.
 * Uses limited slots to avoid excessive clones on long documents.
 */
export function ViewerPageMorphs({ fileId, file }: ViewerPageMorphsProps) {
  const { getScrollState, getThumbnailAPI } = useViewer();
  const scrollState = getScrollState();
  const thumbnailAPI = getThumbnailAPI();
  const { getThumbnailFromCache, requestThumbnail } = useThumbnailGeneration();
  const [thumbnailsByPage, setThumbnailsByPage] = useState<Record<number, string>>({});
  const pendingRequestsRef = useRef(new Map<number, Promise<string | null>>());
  const objectUrlsRef = useRef(new Map<number, string>());

  // Derive a small window of visible pages around the current page
  const visiblePages = useMemo(() => {
    const { currentPage, totalPages } = scrollState;
    if (!currentPage || totalPages === 0) return [];
    const pages: number[] = [];
    for (let i = currentPage - 1; i <= currentPage + 2 && i <= totalPages; i++) {
      if (i >= 1) pages.push(i);
    }
    return pages;
  }, [scrollState.currentPage, scrollState.totalPages]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
      pendingRequestsRef.current.clear();
      setThumbnailsByPage({});
    };
  }, [fileId]);

  useEffect(() => {
    if (!fileId || visiblePages.length === 0) return;

    visiblePages.forEach((pageNumber) => {
      if (thumbnailsByPage[pageNumber] || pendingRequestsRef.current.has(pageNumber)) return;

      const cacheKey = `${fileId}-page-${pageNumber}`;
      const cached = getThumbnailFromCache(cacheKey);
      if (cached) {
        setThumbnailsByPage((prev) => ({ ...prev, [pageNumber]: cached }));
        return;
      }

      let requestPromise: Promise<string | null> | null = null;

      if (thumbnailAPI?.renderThumb) {
        requestPromise = thumbnailAPI
          .renderThumb(pageNumber - 1, 0.18)
          .toPromise()
          .then((blob) => {
            if (!blob) return null;
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.set(pageNumber, url);
            return url;
          })
          .catch(() => null);
      }

      if (!requestPromise && file instanceof File) {
        requestPromise = requestThumbnail(cacheKey, file, pageNumber).catch(() => null);
      }

      if (!requestPromise) return;

      pendingRequestsRef.current.set(pageNumber, requestPromise);

      requestPromise.then((thumbnail) => {
        pendingRequestsRef.current.delete(pageNumber);
        if (!thumbnail) return;
        setThumbnailsByPage((prev) => ({ ...prev, [pageNumber]: thumbnail }));
      });
    });
  }, [
    file,
    fileId,
    getThumbnailFromCache,
    requestThumbnail,
    thumbnailAPI,
    thumbnailsByPage,
    visiblePages,
  ]);

  if (!fileId) return null;

  return (
    <>
      {visiblePages.map((pageNumber, idx) => {
        const thumbSrc = thumbnailsByPage[pageNumber];

        return (
          <ViewerPageMorph
            key={`morph-${fileId}-${pageNumber}`}
            fileId={fileId}
            pageNumber={pageNumber}
            indexOffset={idx}
            thumbnail={thumbSrc}
          />
        );
      })}
    </>
  );
}
