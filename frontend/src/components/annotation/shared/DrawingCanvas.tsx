import React, { useRef, useState } from 'react';
import { Paper, Button, Modal, Stack, Text, Popover, ColorPicker as MantineColorPicker } from '@mantine/core';
import { ColorSwatchButton } from './ColorPicker';
import PenSizeSelector from '../../tools/sign/PenSizeSelector';
import SignaturePad from 'signature_pad';

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
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

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
    }
  };

  const openModal = () => {
    // Clear pad ref so it reinitializes
    if (padRef.current) {
      padRef.current.off();
      padRef.current = null;
    }
    setModalOpen(true);
  };1

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

  const closeModal = () => {
    if (padRef.current && !padRef.current.isEmpty()) {
      const canvas = modalCanvasRef.current;
      if (canvas) {
        const trimmedPng = trimCanvas(canvas);
        onSignatureDataChange(trimmedPng);

        // Update preview canvas with proper aspect ratio
        const img = new Image();
        img.onload = () => {
          if (previewCanvasRef.current) {
            const ctx = previewCanvasRef.current.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);

              // Calculate scaling to fit within preview canvas while maintaining aspect ratio
              const scale = Math.min(
                previewCanvasRef.current.width / img.width,
                previewCanvasRef.current.height / img.height
              );
              const scaledWidth = img.width * scale;
              const scaledHeight = img.height * scale;
              const x = (previewCanvasRef.current.width - scaledWidth) / 2;
              const y = (previewCanvasRef.current.height - scaledHeight) / 2;

              ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
            }
          }
        };
        img.src = trimmedPng;

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

  return (
    <>
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Text fw={500}>Draw your signature</Text>
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
          <Text size="sm" c="dimmed" ta="center">
            Click to open drawing canvas
          </Text>
        </Stack>
      </Paper>

      <Modal opened={modalOpen} onClose={closeModal} title="Draw Your Signature" size="auto" centered>
        <Stack gap="md">
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
            <div>
              <Text size="sm" fw={500} mb="xs">Color</Text>
              <Popover
                opened={colorPickerOpen}
                onChange={setColorPickerOpen}
                position="bottom-start"
                withArrow
                withinPortal={false}
              >
                <Popover.Target>
                  <div>
                    <ColorSwatchButton
                      color={selectedColor}
                      onClick={() => setColorPickerOpen(!colorPickerOpen)}
                    />
                  </div>
                </Popover.Target>
                <Popover.Dropdown>
                  <MantineColorPicker
                    format="hex"
                    value={selectedColor}
                    onChange={(color) => {
                      onColorSwatchClick();
                      updatePenColor(color);
                    }}
                    swatches={['#000000', '#0066cc', '#cc0000', '#cc6600', '#009900', '#6600cc']}
                  />
                </Popover.Dropdown>
              </Popover>
            </div>
            <div>
              <Text size="sm" fw={500} mb="xs">Pen Size</Text>
              <PenSizeSelector
                value={penSize}
                inputValue={penSizeInput}
                onValueChange={(size) => {
                  onPenSizeChange(size);
                  updatePenSize(size);
                }}
                onInputChange={onPenSizeInputChange}
                placeholder="Size"
                size="compact-sm"
                style={{ width: '60px' }}
              />
            </div>
          </div>

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
              maxWidth: '800px',
              height: '400px',
              cursor: 'crosshair',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="subtle" color="red" onClick={clear}>
              Clear Canvas
            </Button>
            <Button onClick={closeModal}>
              Done
            </Button>
          </div>
        </Stack>
      </Modal>
    </>
  );
};

export default DrawingCanvas;
