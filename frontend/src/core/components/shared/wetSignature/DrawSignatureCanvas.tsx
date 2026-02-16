import { useRef, useEffect, useState } from 'react';
import { Stack, Button, Group, ColorPicker, Slider, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DeleteIcon from '@mui/icons-material/Delete';

interface DrawSignatureCanvasProps {
  signature: string | null;
  onChange: (signature: string | null) => void;
  disabled?: boolean;
}

export const DrawSignatureCanvas: React.FC<DrawSignatureCanvasProps> = ({
  signature,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing signature if any
    if (signature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = signature;
    }
  }, [signature]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert canvas to base64 and save
    const dataUrl = canvas.toDataURL('image/png');
    onChange(dataUrl);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('certSign.collab.signRequest.drawSignature', 'Draw your signature below')}
      </Text>

      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-default)',
          cursor: disabled ? 'not-allowed' : 'crosshair',
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'white',
        }}
      />

      <Group gap="sm">
        <div style={{ flex: 1 }}>
          <Text size="xs" mb={4}>
            {t('certSign.collab.signRequest.penColor', 'Pen Color')}
          </Text>
          <ColorPicker
            value={penColor}
            onChange={setPenColor}
            disabled={disabled}
            format="hex"
            size="xs"
          />
        </div>
        <div style={{ flex: 2 }}>
          <Text size="xs" mb={4}>
            {t('certSign.collab.signRequest.penSize', 'Pen Size: {{size}}px', { size: penSize })}
          </Text>
          <Slider
            value={penSize}
            onChange={setPenSize}
            min={1}
            max={10}
            step={1}
            disabled={disabled}
            marks={[
              { value: 1, label: '1' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
            ]}
          />
        </div>
      </Group>

      <Button
        variant="light"
        color="red"
        leftSection={<DeleteIcon sx={{ fontSize: 16 }} />}
        onClick={clearCanvas}
        disabled={disabled || !signature}
        fullWidth
      >
        {t('certSign.collab.signRequest.clearSignature', 'Clear Signature')}
      </Button>
    </Stack>
  );
};
