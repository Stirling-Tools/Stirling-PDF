import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddPageNumbersParameters } from '@app/components/tools/addPageNumbers/useAddPageNumbersParameters';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { useThumbnailGeneration } from '@app/hooks/useThumbnailGeneration';
import styles from '@app/components/tools/addPageNumbers/PageNumberPreview.module.css';
import { PrivateContent } from '@app/components/shared/PrivateContent';

// Simple utilities for page numbers (adapted from stamp)
const A4_ASPECT_RATIO = 0.707;

const getFirstSelectedPage = (input: string): number => {
  if (!input) return 1;
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^\d+\s*-\s*\d+$/.test(part)) {
      const low = parseInt(part.split('-')[0].trim(), 10);
      if (Number.isFinite(low) && low > 0) return low;
    }
    const n = parseInt(part, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
};


const detectOverallBackgroundColor = async (thumbnailSrc: string | null): Promise<'light' | 'dark'> => {
  if (!thumbnailSrc) {
    return 'light'; // Default to light background if no thumbnail
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve('light');
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Sample the entire image at reduced resolution for performance
        const sampleWidth = Math.min(100, img.width);
        const sampleHeight = Math.min(100, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;

        let totalBrightness = 0;
        let pixelCount = 0;

        // Sample every nth pixel for performance
        const step = Math.max(1, Math.floor((img.width * img.height) / (sampleWidth * sampleHeight)));

        for (let i = 0; i < data.length; i += 4 * step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Calculate perceived brightness using luminance formula
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
          totalBrightness += brightness;
          pixelCount++;
        }

        const averageBrightness = totalBrightness / pixelCount;

        // Threshold: 128 is middle gray
        resolve(averageBrightness > 128 ? 'light' : 'dark');
      } catch (error) {
        console.warn('Error detecting background color:', error);
        resolve('light'); // Default fallback
      }
    };

    img.onerror = () => resolve('light');
    img.src = thumbnailSrc;
  });
};

type Props = {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(key: K, value: AddPageNumbersParameters[K]) => void;
  file?: File | null;
  showQuickGrid?: boolean;
};

export default function PageNumberPreview({ parameters, onParameterChange, file, showQuickGrid }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState<{ widthPts: number; heightPts: number } | null>(null);
  const [pageThumbnail, setPageThumbnail] = useState<string | null>(null);
  const { requestThumbnail } = useThumbnailGeneration();
  const [hoverTile, setHoverTile] = useState<number | null>(null);
  const [textColor, setTextColor] = useState<string>('#fff');

  // Observe container size for responsive positioning
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const resize = () => {
      const aspect = pageSize ? (pageSize.widthPts / pageSize.heightPts) : A4_ASPECT_RATIO;
      setContainerSize({ width: node.clientWidth, height: node.clientWidth / aspect });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(node);
    return () => ro.disconnect();
  }, [pageSize]);

  // Load first PDF page size in points for accurate scaling
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!file || file.type !== 'application/pdf') {
        setPageSize(null);
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfWorkerManager.createDocument(buffer, { disableAutoFetch: true, disableStream: true });
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (!cancelled) {
          setPageSize({ widthPts: viewport.width, heightPts: viewport.height });
        }
        pdfWorkerManager.destroyDocument(pdf);
      } catch {
        if (!cancelled) setPageSize(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [file]);

  // Load first-page thumbnail for background preview
  useEffect(() => {
    let isActive = true;
    const loadThumb = async () => {
      if (!file || file.type !== 'application/pdf') {
        setPageThumbnail(null);
        return;
      }
      try {
        const pageNumber = Math.max(1, getFirstSelectedPage(parameters.pagesToNumber || '1'));
        const pageId = `${file.name}:${file.size}:${file.lastModified}:page:${pageNumber}`;
        const thumb = await requestThumbnail(pageId, file, pageNumber);
        if (isActive) setPageThumbnail(thumb || null);
      } catch {
        if (isActive) setPageThumbnail(null);
      }
    };
    loadThumb();
    return () => { isActive = false; };
  }, [file, parameters.pagesToNumber, requestThumbnail]);

  // Detect text color based on overall PDF background
  useEffect(() => {
    if (!pageThumbnail) {
      setTextColor('#fff'); // Default to white for no thumbnail
      return;
    }

    const detectColor = async () => {
      const backgroundType = await detectOverallBackgroundColor(pageThumbnail);
      setTextColor(backgroundType === 'light' ? '#000' : '#fff');
    };

    detectColor();
  }, [pageThumbnail]);

  const containerStyle = useMemo(() => ({
    position: 'relative' as const,
    width: '100%',
    aspectRatio: `${(pageSize?.widthPts ?? 595.28) / (pageSize?.heightPts ?? 841.89)} / 1`,
    backgroundColor: pageThumbnail ? 'transparent' : 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-default, #333)',
    overflow: 'hidden' as const
  }), [pageSize, pageThumbnail]);

  return (
    <div>
      <div className={styles.previewHeader}>
        <div className={styles.divider} />
        <div className={styles.previewLabel}>{t('addPageNumbers.preview', 'Preview Page Numbers')}</div>
      </div>
      <div
        ref={containerRef}
        className={`${styles.container} ${styles.containerBorder} ${pageThumbnail ? styles.containerWithThumbnail : styles.containerWithoutThumbnail}`}
        style={containerStyle}
      >
        {pageThumbnail && (
          <PrivateContent>
            <img
              src={pageThumbnail}
              alt="page preview"
              className={styles.pageThumbnail}
              draggable={false}
            />
          </PrivateContent>
        )}

        {/* Quick position overlay grid - EXACT copy from stamp */}
        {showQuickGrid && (
          <div className={styles.quickGrid}>
            {Array.from({ length: 9 }).map((_, i) => {
              const idx = (i + 1) as 1|2|3|4|5|6|7|8|9;
              const selected = parameters.position === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.gridTile} ${selected || hoverTile === idx ? styles.gridTileSelected : ''} ${hoverTile === idx ? styles.gridTileHovered : ''}`}
                  onClick={() => onParameterChange('position', idx as any)}
                  onMouseEnter={() => setHoverTile(idx)}
                  onMouseLeave={() => setHoverTile(null)}
                  style={{
                    color: textColor,
                    textShadow: textColor === '#fff'
                      ? '1px 1px 2px rgba(0, 0, 0, 0.8)'
                      : '1px 1px 2px rgba(255, 255, 255, 0.8)'
                  }}
                >
                  {idx}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className={styles.previewDisclaimer}>
        {t('addPageNumbers.previewDisclaimer', 'Preview is approximate. Final output may vary due to PDF font metrics.')}
      </div>
    </div>
  );
}
