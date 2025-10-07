import React, { useRef, useState, useCallback } from 'react';
import { Paper, Group, Button, Modal, Stack, Text } from '@mantine/core';
import { ColorSwatchButton } from './ColorPicker';
import PenSizeSelector from '../../tools/sign/PenSizeSelector';

interface DrawingCanvasProps {
  selectedColor: string;
  penSize: number;
  penSizeInput: string;
  onColorSwatchClick: () => void;
  onPenSizeChange: (size: number) => void;
  onPenSizeInputChange: (input: string) => void;
  onSignatureDataChange: (data: string | null) => void;
  onDrawingComplete?: () => void;  // Called when user finishes drawing
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
  modalWidth = 800,
  modalHeight = 400,
  additionalButtons
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null); // Hidden canvas that persists
  const visibleModalCanvasRef = useRef<HTMLCanvasElement>(null); // Visible canvas in modal

  const [isModalDrawing, setIsModalDrawing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal canvas drawing functions - draw to BOTH canvases
  const startModalDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!visibleModalCanvasRef.current || !hiddenCanvasRef.current) return;

    setIsModalDrawing(true);
    const rect = visibleModalCanvasRef.current.getBoundingClientRect();
    const scaleX = visibleModalCanvasRef.current.width / rect.width;
    const scaleY = visibleModalCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Draw on both canvases
    const visibleCtx = visibleModalCanvasRef.current.getContext('2d');
    const hiddenCtx = hiddenCanvasRef.current.getContext('2d');

    [visibleCtx, hiddenCtx].forEach(ctx => {
      if (ctx) {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = penSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    });
  }, [selectedColor, penSize]);

  const drawModal = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isModalDrawing || !visibleModalCanvasRef.current || !hiddenCanvasRef.current) return;

    const rect = visibleModalCanvasRef.current.getBoundingClientRect();
    const scaleX = visibleModalCanvasRef.current.width / rect.width;
    const scaleY = visibleModalCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Draw on both canvases
    const visibleCtx = visibleModalCanvasRef.current.getContext('2d');
    const hiddenCtx = hiddenCanvasRef.current.getContext('2d');

    [visibleCtx, hiddenCtx].forEach(ctx => {
      if (ctx) {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });
  }, [isModalDrawing]);

  const stopModalDrawing = useCallback(() => {
    if (!isModalDrawing) return;
    setIsModalDrawing(false);
  }, [isModalDrawing]);

  // Clear canvas function
  const clearModalCanvas = useCallback(() => {
    // Clear hidden canvas
    if (hiddenCanvasRef.current) {
      const ctx = hiddenCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, hiddenCanvasRef.current.width, hiddenCanvasRef.current.height);
      }
    }

    // Clear visible modal canvas
    if (visibleModalCanvasRef.current) {
      const ctx = visibleModalCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, visibleModalCanvasRef.current.width, visibleModalCanvasRef.current.height);
      }
    }

    // Clear small preview canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    onSignatureDataChange(null);
  }, [onSignatureDataChange]);

  const closeModalAndSave = useCallback(() => {
    if (!hiddenCanvasRef.current) {
      setIsModalOpen(false);
      return;
    }

    // Get data from the hidden canvas (which persists)
    const dataURL = hiddenCanvasRef.current.toDataURL('image/png');

    // Update signature data immediately
    onSignatureDataChange(dataURL);

    // Copy to small canvas for display
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          ctx.drawImage(img, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
        };
        img.src = dataURL;
      }
    }

    // Close modal (hidden canvas stays mounted)
    setIsModalOpen(false);

    // Trigger drawing complete callback to activate placement mode
    if (onDrawingComplete) {
      onDrawingComplete();
    }
  }, [onSignatureDataChange, onDrawingComplete]);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
    // Copy hidden canvas content to visible modal canvas after modal opens
    setTimeout(() => {
      if (hiddenCanvasRef.current && visibleModalCanvasRef.current) {
        const visibleCtx = visibleModalCanvasRef.current.getContext('2d');
        if (visibleCtx) {
          visibleCtx.clearRect(0, 0, visibleModalCanvasRef.current.width, visibleModalCanvasRef.current.height);
          visibleCtx.drawImage(hiddenCanvasRef.current, 0, 0);
        }
      }
    }, 50);
  }, []);

  return (
    <>
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Text fw={500}>Draw your signature</Text>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: disabled ? 'pointer' : 'pointer',
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

      {/* Hidden canvas that persists - always mounted */}
      <canvas
        ref={hiddenCanvasRef}
        width={modalWidth}
        height={modalHeight}
        style={{ display: 'none' }}
      />

      {/* Modal for drawing signature */}
      <Modal
        opened={isModalOpen}
        onClose={closeModalAndSave}
        title="Draw Your Signature"
        size="xl"
        centered
      >
        <Stack gap="md">
          {/* Color and Pen Size picker */}
          <Group gap="lg" align="flex-end">
            <div>
              <Text size="sm" fw={500} mb="xs">Color</Text>
              <ColorSwatchButton
                color={selectedColor}
                onClick={onColorSwatchClick}
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb="xs">Pen Size</Text>
              <PenSizeSelector
                value={penSize}
                inputValue={penSizeInput}
                onValueChange={onPenSizeChange}
                onInputChange={onPenSizeInputChange}
                placeholder="Size"
                size="compact-sm"
                style={{ width: '60px' }}
              />
            </div>
          </Group>

          <canvas
            ref={visibleModalCanvasRef}
            width={modalWidth}
            height={modalHeight}
            style={{
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'crosshair',
              backgroundColor: '#ffffff',
              width: '100%',
              maxWidth: `${modalWidth}px`,
              height: 'auto',
            }}
            onMouseDown={startModalDrawing}
            onMouseMove={drawModal}
            onMouseUp={stopModalDrawing}
            onMouseLeave={stopModalDrawing}
          />

          <Group justify="space-between">
            <Button
              variant="subtle"
              color="red"
              onClick={clearModalCanvas}
            >
              Clear Canvas
            </Button>
            <Button
              onClick={closeModalAndSave}
            >
              Done
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export default DrawingCanvas;