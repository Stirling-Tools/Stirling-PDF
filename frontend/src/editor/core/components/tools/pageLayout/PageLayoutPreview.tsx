import { useEffect, useState } from "react";
import { PageLayoutParameters } from "@editor/hooks/tools/pageLayout/usePageLayoutParameters";
import LayoutPreview from "@editor/components/tools/pageLayout/LayoutPreview";
import { thumbnailGenerationService } from "@editor/services/thumbnailGenerationService";
import { StirlingFile } from "@editor/types/fileContext";
import { Stack } from "@mantine/core";

export default function PageLayoutPreview({
  parameters,
  file,
}: {
  parameters: PageLayoutParameters;
  file?: StirlingFile;
}) {
  const [firstPageDataUrl, setFirstPageDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setFirstPageDataUrl(null);
      return;
    }

    const cacheKey = `${file.fileId}:1:rotated`;
    const cached = thumbnailGenerationService.getThumbnailFromCache(cacheKey);
    if (cached) {
      setFirstPageDataUrl(cached);
      return;
    }

    let cancelled = false;
    setFirstPageDataUrl(null);

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        if (cancelled) return;
        const results = await thumbnailGenerationService.generateThumbnails(
          file.fileId,
          buffer,
          [1],
          { scale: 0.4, quality: 0.85, applyRotation: true },
        );
        if (!cancelled && results[0]?.success) {
          thumbnailGenerationService.addThumbnailToCache(
            cacheKey,
            results[0].thumbnail,
          );
          setFirstPageDataUrl(results[0].thumbnail);
        }
      } catch {
        // Fall back to numbered placeholder boxes if rendering fails
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <Stack gap="sm">
      <LayoutPreview
        parameters={parameters}
        firstPageDataUrl={firstPageDataUrl}
      />
    </Stack>
  );
}
