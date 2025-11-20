import React, { useEffect, useRef, useState } from 'react';
import { Paper, Button, Modal, Stack, Text, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ColorSwatchButton } from '@app/components/annotation/shared/ColorPicker';
import PenSizeSelector from '@app/components/tools/sign/PenSizeSelector';
import SignaturePad from 'signature_pad';
import { PrivateContent } from '@app/components/shared/PrivateContent';

interface DrawingCanvasProps {
  selectedColor: string;
  penSize: number;
  penSizeInput: string;
  onColorSwatchClick: () => void;
  onPenSizeChange: (size: number) => void;
  onPenSizeInputChange: (input: string) => void;
  onSignatureDataChange: (data: string | null) => void;
  onDrawingComplete?: () => void;
  disabled?: boolean;
  width?: number;
  height?: number;
  modalWidth?: number;
  modalHeight?: number;
  additionalButtons?: React.ReactNode;
  initialSignatureData?: string;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  selectedColor,
  penSize,
  penSizeInput,
  onColorSwatchClick,
  onPenSizeChange,
  onPenSizeInputChange,
  onSignatureDataChange,
  onDrawingComplete,
  disabled = false,
  width = 400,
  height = 150,
  initialSignatureData,
}) => {
  const { t } = useTranslation();
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [savedSignatureData, setSavedSignatureData] = useState<string | null>(null);

  const initPad = (canvas: HTMLCanvasElement) => {
    if (!padRef.current) {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      padRef.current = new SignaturePad(canvas, {
        penColor: selectedColor,
        minWidth: penSize * 0.5,
        maxWidth: penSize * 2.5,
        throttle: 10,
        minDistance: 5,
        velocityFilterWeight: 0.7,
      });

      // Restore saved signature data if it exists
      if (savedSignatureData) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
        };
        img.src = savedSignatureData;
      }
    }
  };

  const openModal = () => {
    // Clear pad ref so it reinitializes
    if (padRef.current) {
      padRef.current.off();
      padRef.current = null;
    }
    setModalOpen(true);
  };

  const trimCanvas = (canvas: HTMLCanvasElement): string => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

    // Find bounds of non-transparent pixels
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const trimWidth = maxX - minX + 1;
    const trimHeight = maxY - minY + 1;

    // Create trimmed canvas
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimWidth;
    trimmedCanvas.height = trimHeight;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (trimmedCtx) {
      trimmedCtx.drawImage(canvas, minX, minY, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);
    }

    return trimmedCanvas.toDataURL('image/png');
  };

  const renderPreview = (dataUrl: string) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const x = (canvas.width - scaledWidth) / 2;
      const y = (canvas.height - scaledHeight) / 2;

      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
    };
    img.src = dataUrl;
  };

  const closeModal = () => {
    if (padRef.current && !padRef.current.isEmpty()) {
      const canvas = modalCanvasRef.current;
      if (canvas) {
        const trimmedPng = trimCanvas(canvas);
        const untrimmedPng = canvas.toDataURL('image/png');
        setSavedSignatureData(untrimmedPng); // Save untrimmed for restoration
        onSignatureDataChange(trimmedPng);
        renderPreview(trimmedPng);

        if (onDrawingComplete) {
          onDrawingComplete();
        }
      }
    }
    if (padRef.current) {
      padRef.current.off();
      padRef.current = null;
    }
    setModalOpen(false);
  };

  const clear = () => {
    if (padRef.current) {
      padRef.current.clear();
    }
    if (previewCanvasRef.current) {
      const ctx = previewCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
      }
    }
    setSavedSignatureData(null); // Clear saved signature
    onSignatureDataChange(null);
  };

  const updatePenColor = (color: string) => {
    if (padRef.current) {
      padRef.current.penColor = color;
    }
  };

  const updatePenSize = (size: number) => {
    if (padRef.current) {
      padRef.current.minWidth = size * 0.8;
      padRef.current.maxWidth = size * 1.2;
    }
  };

  useEffect(() => {
    updatePenColor(selectedColor);
  }, [selectedColor]);

  useEffect(() => {
    updatePenSize(penSize);
  }, [penSize]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!initialSignatureData) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSavedSignatureData(null);

      return;
    }

    renderPreview(initialSignatureData);
    setSavedSignatureData(initialSignatureData);
  }, [initialSignatureData]);

  return (
    <>
      <Paper withBorder p="md">
        <Stack gap="sm">
          <PrivateContent>
          <Text fw={500}>{t('sign.canvas.heading', 'Draw your signature')}</Text>
          <canvas
            ref={previewCanvasRef}
            width={width}
            height={height}
            style={{
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: disabled ? 'default' : 'pointer',
              backgroundColor: '#ffffff',
              width: '100%',
            }}
            onClick={disabled ? undefined : openModal}
          />
          </PrivateContent>
          <Text size="sm" c="dimmed" ta="center">
            {t('sign.canvas.clickToOpen', 'Click to open the drawing canvas')}
          </Text>
        </Stack>
      </Paper>

      <Modal opened={modalOpen} onClose={closeModal} title={t('sign.canvas.modalTitle', 'Draw your signature')} size="auto" centered>
        <Stack gap="md">
          <Group gap="lg" align="flex-end" wrap="wrap">
            <Stack gap={4} style={{ minWidth: 120 }}>
              <Text size="sm" fw={500}>
                {t('sign.canvas.colorLabel', 'Colour')}
              </Text>
              <ColorSwatchButton
                color={selectedColor}
                onClick={onColorSwatchClick}
              />
            </Stack>
            <Stack gap={4} style={{ minWidth: 120 }}>
              <Text size="sm" fw={500}>
                {t('sign.canvas.penSizeLabel', 'Pen size')}
              </Text>
              <PenSizeSelector
                value={penSize}
                inputValue={penSizeInput}
                onValueChange={(size) => {
                  onPenSizeChange(size);
                  updatePenSize(size);
                }}
                onInputChange={onPenSizeInputChange}
                placeholder={t('sign.canvas.penSizePlaceholder', 'Size')}
                size="compact-sm"
                style={{ width: '80px' }}
              />
            </Stack>
          </Group>

          <PrivateContent>
            <canvas
              ref={(el) => {
                modalCanvasRef.current = el;
                if (el) initPad(el);
              }}
              style={{
                border: '1px solid #ccc',
                borderRadius: '4px',
                display: 'block',
                touchAction: 'none',
                backgroundColor: 'white',
                width: '100%',
                maxWidth: '50rem',
                height: '25rem',
                cursor: 'crosshair',
              }}
            />
          </PrivateContent>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="subtle" color="red" onClick={clear}>
              {t('sign.canvas.clear', 'Clear canvas')}
            </Button>
            <Button onClick={closeModal}>
              {t('common.done', 'Done')}
            </Button>
          </div>
        </Stack>
      </Modal>
    </>
  );
};

export default DrawingCanvas;
