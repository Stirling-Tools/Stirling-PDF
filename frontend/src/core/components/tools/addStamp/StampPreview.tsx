import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AddStampParameters } from '@app/components/tools/addStamp/useAddStampParameters';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { useThumbnailGeneration } from '@app/hooks/useThumbnailGeneration';
import { A4_ASPECT_RATIO, getFirstSelectedPage, getFontFamily, computeStampPreviewStyle, getAlphabetPreviewScale } from '@app/components/tools/addStamp/StampPreviewUtils';
import styles from '@app/components/tools/addStamp/StampPreview.module.css';
import {PrivateContent} from "@app/components/shared/PrivateContent";

type Props = {
  parameters: AddStampParameters;
  onParameterChange: <K extends keyof AddStampParameters>(key: K, value: AddStampParameters[K]) => void;
  file?: File | null;
  showQuickGrid?: boolean;
};

export default function StampPreview({ parameters, onParameterChange, file, showQuickGrid }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imageMeta, setImageMeta] = useState<{ url: string; width: number; height: number } | null>(null);
  const [pageSize, setPageSize] = useState<{ widthPts: number; heightPts: number } | null>(null);
  const [pageThumbnail, setPageThumbnail] = useState<string | null>(null);
  const { requestThumbnail } = useThumbnailGeneration();
  const [hoverTile, setHoverTile] = useState<number | null>(null);

  // Load image URL and meta for aspect ratio if an image is selected
  useEffect(() => {
    if (parameters.stampType === 'image' && parameters.stampImage) {
      const url = URL.createObjectURL(parameters.stampImage);
      const img = new Image();
      img.onload = () => {
        setImageMeta({ url, width: img.width, height: img.height });
      };
      img.src = url;
      return () => URL.revokeObjectURL(url);
    } else {
      setImageMeta(null);
    }
  }, [parameters.stampType, parameters.stampImage]);

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
        // Fallback to A4 if we cannot read page
        if (!cancelled) setPageSize(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [file]);

  // Load first-page thumbnail for background preview so users see the content
  useEffect(() => {
    let isActive = true;
    const loadThumb = async () => {
      if (!file || file.type !== 'application/pdf') {
        setPageThumbnail(null);
        return;
      }
      try {
        const pageNumber = Math.max(1, getFirstSelectedPage(parameters.pageNumbers));
        const pageId = `${file.name}:${file.size}:${file.lastModified}:page:${pageNumber}`;
        const thumb = await requestThumbnail(pageId, file, pageNumber);
        if (isActive) setPageThumbnail(thumb || null);
      } catch {
        if (isActive) setPageThumbnail(null);
      }
    };
    loadThumb();
    return () => { isActive = false; };
  }, [file, parameters.pageNumbers, requestThumbnail]);

  const style = useMemo(() => (
    computeStampPreviewStyle(
      parameters,
      imageMeta,
      pageSize,
      containerSize,
      showQuickGrid,
      hoverTile,
      !!pageThumbnail
    )
  ), [containerSize, parameters, imageMeta, pageSize, showQuickGrid, hoverTile, pageThumbnail]);

  // Keep center fixed when scaling via slider (or any fontSize changes)
  const prevDimsRef = useRef<{ fontSize: number; widthPx: number; heightPx: number; leftPx: number; bottomPx: number } | null>(null);
  useEffect(() => {
    const itemStyle = style.item as any;
    if (!itemStyle || containerSize.width <= 0 || containerSize.height <= 0) return;

    const parse = (v: any) => parseFloat(String(v).replace('px', '')) || 0;
    const leftPx = parse(itemStyle.left);
    const bottomPx = parse(itemStyle.bottom);
    const widthPx = parse(itemStyle.width);
    const heightPx = parse(itemStyle.height);

    const prev = prevDimsRef.current;
    const hasOverrides = parameters.overrideX >= 0 && parameters.overrideY >= 0;
    const canAdjust = hasOverrides && !showQuickGrid;
    if (
      prev &&
      canAdjust &&
      parameters.fontSize !== prev.fontSize &&
      prev.widthPx > 0 &&
      prev.heightPx > 0 &&
      widthPx > 0 &&
      heightPx > 0
    ) {
      const centerX = prev.leftPx + prev.widthPx / 2;
      const centerY = prev.bottomPx + prev.heightPx / 2;
      const newLeftPx = centerX - widthPx / 2;
      const newBottomPx = centerY - heightPx / 2;

      const widthPts = pageSize?.widthPts ?? 595.28;
      const heightPts = pageSize?.heightPts ?? 841.89;
      const scaleX = containerSize.width / widthPts;
      const scaleY = containerSize.height / heightPts;
      const newLeftPts = Math.max(0, Math.min(containerSize.width, newLeftPx)) / scaleX;
      const newBottomPts = Math.max(0, Math.min(containerSize.height, newBottomPx)) / scaleY;
      onParameterChange('overrideX', newLeftPts as any);
      onParameterChange('overrideY', newBottomPts as any);
    }

    prevDimsRef.current = { fontSize: parameters.fontSize, widthPx, heightPx, leftPx, bottomPx };
  }, [parameters.fontSize, style.item, containerSize, pageSize, showQuickGrid, parameters.overrideX, parameters.overrideY, onParameterChange]);

  // Drag/resize/rotate interactions
  const draggingRef = useRef<{ type: 'move' | 'resize' | 'rotate'; startX: number; startY: number; initLeft: number; initBottom: number; initHeight: number; centerX: number; centerY: number } | null>(null);

  const ensureOverrides = () => {
    const pageWidth = containerSize.width;
    const pageHeight = containerSize.height;
    if (pageWidth <= 0 || pageHeight <= 0) return;

    // Recompute current x,y from style (so that we start from visual position)
    const itemStyle = style.item as any;
    const leftPx = parseFloat(String(itemStyle.left).replace('px', '')) || 0;
    const bottomPx = parseFloat(String(itemStyle.bottom).replace('px', '')) || 0;
    const widthPts = pageSize?.widthPts ?? 595.28;
    const heightPts = pageSize?.heightPts ?? 841.89;
    const scaleX = containerSize.width / widthPts;
    const scaleY = containerSize.height / heightPts;
    if (parameters.overrideX < 0 || parameters.overrideY < 0) {
      onParameterChange('overrideX', Math.max(0, Math.min(pageWidth, leftPx)) / scaleX as any);
      onParameterChange('overrideY', Math.max(0, Math.min(pageHeight, bottomPx)) / scaleY as any);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, type: 'move' | 'resize' | 'rotate') => {
    e.preventDefault();
    ensureOverrides();

    const item = style.item as any;
    const left = parseFloat(String(item.left).replace('px', '')) || 0;
    const bottom = parseFloat(String(item.bottom).replace('px', '')) || 0;
    const width = parseFloat(String(item.width).replace('px', '')) || parameters.fontSize;
    const height = parseFloat(String(item.height).replace('px', '')) || parameters.fontSize;

    const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = bottom + height / 2;

    draggingRef.current = {
      type,
      startX: e.clientX - (rect?.left || 0),
      startY: (rect ? rect.bottom - e.clientY : 0), // convert to bottom-based coords
      initLeft: left,
      initBottom: bottom,
      initHeight: height,
      centerX,
      centerY,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = rect.bottom - e.clientY; // bottom-based

    const drag = draggingRef.current;

    if (drag.type === 'move') {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const newLeftPx = Math.max(0, Math.min(containerSize.width, drag.initLeft + dx));
      const newBottomPx = Math.max(0, Math.min(containerSize.height, drag.initBottom + dy));
      const widthPts = pageSize?.widthPts ?? 595.28;
      const heightPts = pageSize?.heightPts ?? 841.89;
      const scaleX = containerSize.width / widthPts;
      const scaleY = containerSize.height / heightPts;
      const newLeftPts = newLeftPx / scaleX;
      const newBottomPts = newBottomPx / scaleY;
      onParameterChange('overrideX', newLeftPts as any);
      onParameterChange('overrideY', newBottomPts as any);
    }

    if (drag.type === 'resize') {
      // Height is our canonical size (fontSize)
      const heightPts = pageSize?.heightPts ?? 841.89;
      const scaleY = containerSize.height / heightPts;
      const newHeightPx = Math.max(1, drag.initHeight + (y - drag.startY));
      const newHeightPts = newHeightPx / scaleY;
      onParameterChange('fontSize', newHeightPts as any);
    }

    if (drag.type === 'rotate') {
      const angle = Math.atan2(y - drag.centerY, x - drag.centerX) * (180 / Math.PI);
      onParameterChange('rotation', angle as any);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const itemHandles = null; // Drag-only per request

  return (
    <div>
      <div className={styles.previewHeader}>
        <div className={styles.divider} />
        <div className={styles.previewLabel}>Preview Stamp</div>
      </div>
      <div
        ref={containerRef}
        className={`${styles.container} ${styles.containerBorder} ${pageThumbnail ? styles.containerWithThumbnail : styles.containerWithoutThumbnail}`}
        style={style.container as React.CSSProperties}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
        {parameters.stampType === 'text' && (
          <div
            className={`${styles.stampItem} ${styles.stampItemGridMode}`}
            style={style.item as React.CSSProperties}
          >
            {(parameters.stampText || '').split('\n').map((line, idx) => (
              <span
                key={idx}
                className={styles.textLine}
                style={{
                  fontFamily: getFontFamily(parameters.alphabet),
                  fontSize: `${Math.max(1, (parameters.fontSize * getAlphabetPreviewScale(parameters.alphabet)) / 2)}px`,
                  whiteSpace: 'nowrap',
                }}
              >
                {line || '\u00A0'}
              </span>
            ))}
            {itemHandles}
          </div>
        )}
        {parameters.stampType === 'image' && imageMeta && (
          <div
            className={`${styles.stampItem} ${showQuickGrid ? styles.stampItemGridMode : styles.stampItemDraggable}`}
            style={style.item as React.CSSProperties}
            onPointerDown={(e) => handlePointerDown(e, 'move')}
          >
            <img
              src={imageMeta.url}
              alt="stamp preview"
              className={styles.stampImage}
            />
            {itemHandles}
          </div>
        )}

        {/* Quick position overlay grid */}
        {showQuickGrid && (
          <div className={styles.quickGrid}>
            {Array.from({ length: 9 }).map((_, i) => {
              const idx = (i + 1) as 1|2|3|4|5|6|7|8|9;
              const selected = parameters.position === idx && (parameters.overrideX < 0 || parameters.overrideY < 0);
              return (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.gridTile} ${selected || hoverTile === idx ? styles.gridTileSelected : ''} ${hoverTile === idx ? styles.gridTileHovered : ''}`}
                  onClick={() => {
                    // Clear overrides to use grid positioning and set position
                    onParameterChange('overrideX', -1 as any);
                    onParameterChange('overrideY', -1 as any);
                    onParameterChange('position', idx as any);
                  }}
                  onMouseEnter={() => setHoverTile(idx)}
                  onMouseLeave={() => setHoverTile(null)}
                >
                  {idx}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className={styles.previewDisclaimer}>
        Preview is approximate. Final output may vary due to PDF font metrics.
      </div>
    </div>
  );
}


