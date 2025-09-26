import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FakeScanParameters } from '../../../hooks/tools/fakeScan/useFakeScanParameters';
import { useThumbnailGeneration } from '../../../hooks/useThumbnailGeneration';
import ObscuredOverlay from '../../shared/ObscuredOverlay';
import { useTranslation } from 'react-i18next';

type Props = {
  file?: File | null;
  parameters: FakeScanParameters;
};

export default function FakeScanPreview({ file, parameters }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageThumbnail, setPageThumbnail] = useState<string | null>(null);
  const { requestThumbnail } = useThumbnailGeneration();
  const { t } = useTranslation();
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!file || file.type !== 'application/pdf') {
        setPageThumbnail(null);
        return;
      }
      try {
        const pageId = `${file.name}:${file.size}:${file.lastModified}:page:1`;
        const thumb = await requestThumbnail(pageId, file, 1);
        if (active) setPageThumbnail(thumb || null);
      } catch {
        if (active) setPageThumbnail(null);
      }
    };
    load();
    return () => { active = false; };
  }, [file, requestThumbnail]);

  const cssFilter = useMemo(() => {
    // Apply basic quality preset if advanced settings are not enabled
    let brightness = parameters.brightness;
    let contrast = parameters.contrast;
    let blur = Math.max(0, parameters.blur);
    
    if (!parameters.advancedEnabled) {
      // Apply quality presets
      switch (parameters.quality) {
        case 'high':
          brightness = 1.02;
          contrast = 1.05;
          blur = 0.1;
          break;
        case 'medium':
          brightness = 1.05;
          contrast = 1.1;
          blur = 0.5;
          break;
        case 'low':
          brightness = 1.1;
          contrast = 1.2;
          blur = 1.0;
          break;
      }
    }

    const grayscale = parameters.colorspace === 'grayscale' ? 'grayscale(1)' : 'grayscale(0)';
    const sepia = parameters.yellowish ? 'sepia(0.6)' : 'sepia(0)';
    // Simulate noise via drop-shadow stacking is heavy; skip and rely on server-side
    return `${grayscale} ${sepia} brightness(${brightness}) contrast(${contrast}) blur(${blur}px)`;
  }, [parameters]);

  const rotation = useMemo(() => {
    let base = parameters.rotate;
    
    // Apply basic rotation preset if advanced settings are not enabled
    if (!parameters.advancedEnabled) {
      switch (parameters.rotation) {
        case 'slight':
          base += 2;
          break;
        case 'moderate':
          base += 5;
          break;
        case 'severe':
          base += 8;
          break;
        case 'none':
        default:
          // No additional rotation
          break;
      }
    }
    
    const variance = parameters.rotateVariance;
    // Show deterministic max variance for preview
    return base + variance;
  }, [parameters.rotate, parameters.rotateVariance, parameters.rotation, parameters.advancedEnabled]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
        <div style={{ fontSize: 12, color: 'var(--text-color-muted)' }}>Preview (approximate)</div>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
      </div>
      <ObscuredOverlay
        obscured={!pageThumbnail}
        overlayMessage={(
          <div style={{ fontSize: 12, color: 'var(--text-color-muted)' }}>{t("fakeScan.noPreview", "No preview available, select a PDF to preview fake scan")}</div>
        )}
        borderRadius={4}
      >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          background: 'var(--surface-1)',
          overflow: 'hidden',
          aspectRatio: '8.5/11',
          position: 'relative',
        }}
      >
        {pageThumbnail && (
          <img
            src={pageThumbnail}
            alt="page preview"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: cssFilter,
              transform: `rotate(${rotation}deg)`
            }}
            draggable={false}
          />
        )}
        {!pageThumbnail && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            color: 'var(--text-color-muted)', fontSize: 12
          }}>
            {t("fakeScan.noPreview", "No preview available, select a PDF to preview fake scan")}
          </div>
        )}
      </div>
      </ObscuredOverlay>
    </div>
  );
}


