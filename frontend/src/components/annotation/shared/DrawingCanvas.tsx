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
  disabled = false,
  width = 400,
  height = 150,
  modalWidth = 800,
  modalHeight = 400,
  additionalButtons
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const visibleModalCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isModalDrawing, setIsModalDrawing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Drawing functions for main canvas
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || disabled) return;

    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = penSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }, [disabled, selectedColor, penSize]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || disabled) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [isDrawing, disabled]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing || disabled) return;

    setIsDrawing(false);

    // Save canvas as signature data
    if (canvasRef.current) {
      const dataURL = canvasRef.current.toDataURL('image/png');
      setSignatureData(dataURL);
      onSignatureDataChange(dataURL);
    }
  }, [isDrawing, disabled, onSignatureDataChange]);

  // Modal canvas drawing functions
  const startModalDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!visibleModalCanvasRef.current || !modalCanvasRef.current) return;

    setIsModalDrawing(true);
    const rect = visibleModalCanvasRef.current.getBoundingClientRect();
    const scaleX = visibleModalCanvasRef.current.width / rect.width;
    const scaleY = visibleModalCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Draw on both the visible modal canvas and hidden canvas
    const visibleCtx = visibleModalCanvasRef.current.getContext('2d');
    const hiddenCtx = modalCanvasRef.current.getContext('2d');

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
    if (!isModalDrawing || !visibleModalCanvasRef.current || !modalCanvasRef.current) return;

    const rect = visibleModalCanvasRef.current.getBoundingClientRect();
    const scaleX = visibleModalCanvasRef.current.width / rect.width;
    const scaleY = visibleModalCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Draw on both canvases
    const visibleCtx = visibleModalCanvasRef.current.getContext('2d');
    const hiddenCtx = modalCanvasRef.current.getContext('2d');

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

    // Sync the canvases and update signature data (only when drawing stops)
    if (modalCanvasRef.current) {
      const dataURL = modalCanvasRef.current.toDataURL('image/png');
      setSignatureData(dataURL);
      onSignatureDataChange(dataURL);

      // Also update the small canvas display
      if (canvasRef.current) {
        const smallCtx = canvasRef.current.getContext('2d');
        if (smallCtx) {
          const img = new Image();
          img.onload = () => {
            smallCtx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
            smallCtx.drawImage(img, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
          };
          img.src = dataURL;
        }
      }
    }
  }, [isModalDrawing]);

  // Clear canvas functions
  const clearCanvas = useCallback(() => {
    if (!canvasRef.current || disabled) return;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      // Also clear the modal canvas if it exists
      if (modalCanvasRef.current) {
        const modalCtx = modalCanvasRef.current.getContext('2d');
        if (modalCtx) {
          modalCtx.clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height);
        }
      }

      setSignatureData(null);
      onSignatureDataChange(null);
    }
  }, [disabled]);

  const clearModalCanvas = useCallback(() => {
    // Clear both modal canvases (visible and hidden)
    if (modalCanvasRef.current) {
      const hiddenCtx = modalCanvasRef.current.getContext('2d');
      if (hiddenCtx) {
        hiddenCtx.clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height);
      }
    }

    if (visibleModalCanvasRef.current) {
      const visibleCtx = visibleModalCanvasRef.current.getContext('2d');
      if (visibleCtx) {
        visibleCtx.clearRect(0, 0, visibleModalCanvasRef.current.width, visibleModalCanvasRef.current.height);
      }
    }

    // Also clear the main canvas and signature data
    if (canvasRef.current) {
      const mainCtx = canvasRef.current.getContext('2d');
      if (mainCtx) {
        mainCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    setSignatureData(null);
    onSignatureDataChange(null);
  }, []);

  const saveModalSignature = useCallback(() => {
    if (!modalCanvasRef.current) return;

    const dataURL = modalCanvasRef.current.toDataURL('image/png');
    setSignatureData(dataURL);
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

    setIsModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
    // Copy content to modal canvas after a brief delay
    setTimeout(() => {
      if (visibleModalCanvasRef.current && modalCanvasRef.current) {
        const visibleCtx = visibleModalCanvasRef.current.getContext('2d');
        if (visibleCtx) {
          visibleCtx.strokeStyle = selectedColor;
          visibleCtx.lineWidth = penSize;
          visibleCtx.lineCap = 'round';
          visibleCtx.lineJoin = 'round';
          visibleCtx.clearRect(0, 0, visibleModalCanvasRef.current.width, visibleModalCanvasRef.current.height);
          visibleCtx.drawImage(modalCanvasRef.current, 0, 0, visibleModalCanvasRef.current.width, visibleModalCanvasRef.current.height);
        }
      }
    }, 300);
  }, [selectedColor, penSize]);

  // Initialize canvas settings whenever color or pen size changes
  React.useEffect(() => {
    const updateCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = penSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };

    updateCanvas(canvasRef.current);
    updateCanvas(modalCanvasRef.current);
    updateCanvas(visibleModalCanvasRef.current);
  }, [selectedColor, penSize]);

  return (
    <>
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>Draw your signature</Text>
            <Group gap="lg">
              <div>
                <Text size="sm" fw={500} mb="xs" ta="center">Color</Text>
                <Group justify="center">
                  <ColorSwatchButton
                    color={selectedColor}
                    onClick={onColorSwatchClick}
                  />
                </Group>
              </div>
              <div>
                <Text size="sm" fw={500} mb="xs">Pen Size</Text>
                <PenSizeSelector
                  value={penSize}
                  inputValue={penSizeInput}
                  onValueChange={onPenSizeChange}
                  onInputChange={onPenSizeInputChange}
                  disabled={disabled}
                  placeholder="Size"
                  size="compact-sm"
                  style={{ width: '60px' }}
                />
              </div>
              <div style={{ paddingTop: '24px' }}>
                <Button
                  variant="light"
                  size="compact-sm"
                  onClick={openModal}
                  disabled={disabled}
                >
                  Expand
                </Button>
              </div>
            </Group>
          </Group>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: disabled ? 'default' : 'crosshair',
              backgroundColor: '#ffffff',
              width: '100%',
            }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
          <Group justify="space-between">
            <div>
              {additionalButtons}
            </div>
            <Button
              variant="subtle"
              color="red"
              size="compact-sm"
              onClick={clearCanvas}
              disabled={disabled}
            >
              Clear
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Hidden canvas for modal synchronization */}
      <canvas
        ref={modalCanvasRef}
        width={modalWidth}
        height={modalHeight}
        style={{ display: 'none' }}
      />

      {/* Modal for larger signature canvas */}
      <Modal
        opened={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Draw Your Signature"
        size="xl"
        centered
      >
        <Stack gap="md">
          {/* Color and Pen Size picker */}
          <Paper withBorder p="sm">
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
          </Paper>

          <Paper withBorder p="md">
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
          </Paper>

          <Group justify="space-between">
            <Button
              variant="subtle"
              color="red"
              onClick={clearModalCanvas}
            >
              Clear Canvas
            </Button>
            <Group gap="sm">
              <Button
                variant="subtle"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={saveModalSignature}
              >
                Save Signature
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export default DrawingCanvas;