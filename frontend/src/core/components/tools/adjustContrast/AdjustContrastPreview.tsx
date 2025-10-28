import { useEffect, useRef, useState } from 'react';
import { AdjustContrastParameters } from '@app/hooks/tools/adjustContrast/useAdjustContrastParameters';
import { useThumbnailGeneration } from '@app/hooks/useThumbnailGeneration';
import ObscuredOverlay from '@app/components/shared/ObscuredOverlay';
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { applyAdjustmentsToCanvas } from '@app/components/tools/adjustContrast/utils';

interface Props {
  file: File | null;
  parameters: AdjustContrastParameters;
}

export default function AdjustContrastPreview({ file, parameters }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const { requestThumbnail } = useThumbnailGeneration();

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!file || file.type !== 'application/pdf') { setThumb(null); return; }
      const id = `${file.name}:${file.size}:${file.lastModified}:page:1`;
      const tUrl = await requestThumbnail(id, file, 1);
      if (active) setThumb(tUrl || null);
    };
    load();
    return () => { active = false; };
  }, [file, requestThumbnail]);

  useEffect(() => {
    const revoked: string | null = null;
    const render = async () => {
      if (!thumb || !canvasRef.current) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = thumb;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
      });

      // Draw thumbnail to a source canvas
      const src = document.createElement('canvas');
      src.width = img.naturalWidth;
      src.height = img.naturalHeight;
      const sctx = src.getContext('2d');
      if (!sctx) return;
      sctx.drawImage(img, 0, 0);

      // Apply accurate pixel adjustments
      const adjusted = applyAdjustmentsToCanvas(src, parameters);

      // Draw adjusted onto display canvas
      const display = canvasRef.current;
      display.width = adjusted.width;
      display.height = adjusted.height;
      const dctx = display.getContext('2d');
      if (!dctx) return;
      dctx.clearRect(0, 0, display.width, display.height);
      dctx.drawImage(adjusted, 0, 0);
    };
    render();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [thumb, parameters]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
        <div style={{ fontSize: 12, color: 'var(--text-color-muted)' }}>{t('common.preview', 'Preview')}</div>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
      </div>
      <ObscuredOverlay
        obscured={!thumb}
        overlayMessage={<Text size="sm" c="white" fw={600}>{t('adjustContrast.noPreview', 'Select a PDF to preview')}</Text>}
        borderRadius={6}
      >
        <div ref={containerRef} style={{ aspectRatio: '8.5/11', width: '100%', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
          {thumb && (
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>
      </ObscuredOverlay>
    </div>
  );
}


