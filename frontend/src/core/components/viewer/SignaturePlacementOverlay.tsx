import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@mantine/core';
import type { SignParameters } from '@app/hooks/tools/sign/useSignParameters';
import { buildSignaturePreview, SignaturePreview } from '@app/utils/signaturePreview';
import { useSignature } from '@app/contexts/SignatureContext';
import {
  MAX_PREVIEW_WIDTH_RATIO,
  MAX_PREVIEW_HEIGHT_RATIO,
  MAX_PREVIEW_WIDTH_REM,
  MAX_PREVIEW_HEIGHT_REM,
  MIN_SIGNATURE_DIMENSION_REM,
  OVERLAY_EDGE_PADDING_REM,
} from '@app/constants/signConstants';

// Convert rem to pixels using browser's base font size (typically 16px)
const remToPx = (rem: number) => rem * parseFloat(getComputedStyle(document.documentElement).fontSize);

interface SignaturePlacementOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  isActive: boolean;
  signatureConfig: SignParameters | null;
}

export const SignaturePlacementOverlay: React.FC<SignaturePlacementOverlayProps> = ({
  containerRef,
  isActive,
  signatureConfig,
}) => {
  const [preview, setPreview] = useState<SignaturePreview | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const { setPlacementPreviewSize } = useSignature();

  useEffect(() => {
    let cancelled = false;

    const buildPreview = async () => {
      try {
        const value = await buildSignaturePreview(signatureConfig ?? null);
        if (!cancelled) {
          setPreview(value);
        }
      } catch (error) {
        console.error('Failed to build signature preview:', error);
        if (!cancelled) {
          setPreview(null);
        }
      }
    };

    buildPreview();

    return () => {
      cancelled = true;
    };
  }, [signatureConfig]);

  useEffect(() => {
    const element = containerRef.current;
    if (!isActive || !element) {
      setCursor(null);
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      setCursor({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    const handleLeave = () => setCursor(null);

    element.addEventListener('mousemove', handleMove);
    element.addEventListener('mouseleave', handleLeave);

    return () => {
      element.removeEventListener('mousemove', handleMove);
      element.removeEventListener('mouseleave', handleLeave);
    };
  }, [containerRef, isActive]);

  const scaledSize = useMemo(() => {
    if (!preview || !containerRef.current) {
      return null;
    }

    const container = containerRef.current;
    const containerWidth = container.clientWidth || 1;
    const containerHeight = container.clientHeight || 1;

    const maxWidth = Math.min(containerWidth * MAX_PREVIEW_WIDTH_RATIO, remToPx(MAX_PREVIEW_WIDTH_REM));
    const maxHeight = Math.min(containerHeight * MAX_PREVIEW_HEIGHT_RATIO, remToPx(MAX_PREVIEW_HEIGHT_REM));

    const scale = Math.min(
      1,
      maxWidth / Math.max(preview.width, 1),
      maxHeight / Math.max(preview.height, 1)
    );

    return {
      width: Math.max(remToPx(MIN_SIGNATURE_DIMENSION_REM), preview.width * scale),
      height: Math.max(remToPx(MIN_SIGNATURE_DIMENSION_REM), preview.height * scale),
    };
  }, [preview, containerRef]);

  useEffect(() => {
    if (!isActive || !scaledSize) {
      setPlacementPreviewSize(null);
    } else {
      setPlacementPreviewSize(scaledSize);
    }
  }, [isActive, scaledSize, setPlacementPreviewSize]);

  useEffect(() => {
    return () => {
      setPlacementPreviewSize(null);
    };
  }, [setPlacementPreviewSize]);

  const display = useMemo(() => {
    if (!preview || !scaledSize || !cursor || !containerRef.current) {
      return null;
    }

    const container = containerRef.current;
    const containerWidth = container.clientWidth || 1;
    const containerHeight = container.clientHeight || 1;

    const width = scaledSize.width;
    const height = scaledSize.height;
    const edgePadding = remToPx(OVERLAY_EDGE_PADDING_REM);

    const clampedLeft = Math.max(edgePadding, Math.min(cursor.x - width / 2, containerWidth - width - edgePadding));
    const clampedTop = Math.max(edgePadding, Math.min(cursor.y - height / 2, containerHeight - height - edgePadding));

    return {
      left: clampedLeft,
      top: clampedTop,
      width,
      height,
      dataUrl: preview.dataUrl,
    };
  }, [preview, scaledSize, cursor, containerRef]);

  if (!isActive || !display || !preview) {
    return null;
  }

  return (
    <Box
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        left: `${display.left}px`,
        top: `${display.top}px`,
        width: `${display.width}px`,
        height: `${display.height}px`,
        backgroundImage: `url(${display.dataUrl})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        boxShadow: '0 0 0 1px rgba(30, 136, 229, 0.55), 0 6px 18px rgba(30, 136, 229, 0.25)',
        borderRadius: '4px',
        transition: 'transform 70ms ease-out',
        transform: 'translateZ(0)',
        opacity: 0.6,
      }}
    />
  );
};
