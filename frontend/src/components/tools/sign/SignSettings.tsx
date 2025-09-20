import React, { useRef, useState } from 'react';
import { useTranslation } from "react-i18next";
import { Stack, TextInput, FileInput, Paper, Group, Button, Text, Alert } from '@mantine/core';
import ButtonSelector from "../../shared/ButtonSelector";
import { SignParameters } from "../../../hooks/tools/sign/useSignParameters";

interface SignSettingsProps {
  parameters: SignParameters;
  onParameterChange: <K extends keyof SignParameters>(key: K, value: SignParameters[K]) => void;
  disabled?: boolean;
  onActivateDrawMode?: () => void;
  onActivateSignaturePlacement?: () => void;
  onDeactivateSignature?: () => void;
}

const SignSettings = ({ parameters, onParameterChange, disabled = false, onActivateDrawMode, onActivateSignaturePlacement, onDeactivateSignature }: SignSettingsProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState<File | null>(null);

  // Drawing functions for signature canvas
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || disabled) return;

    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || disabled) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing || disabled) return;

    setIsDrawing(false);

    // Save canvas as signature data
    if (canvasRef.current) {
      const dataURL = canvasRef.current.toDataURL('image/png');
      console.log('Saving canvas signature data:', dataURL.substring(0, 50) + '...');
      onParameterChange('signatureData', dataURL);
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current || disabled) return;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      onParameterChange('signatureData', undefined);
    }
  };

  // Handle signature image upload
  const handleSignatureImageChange = (file: File | null) => {
    console.log('Image file selected:', file);
    if (file && !disabled) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          console.log('Image loaded, saving to signatureData, length:', (e.target.result as string).length);
          onParameterChange('signatureData', e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
      setSignatureImage(file);
    }
  };

  // Initialize canvas
  React.useEffect(() => {
    if (canvasRef.current && parameters.signatureType === 'draw') {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [parameters.signatureType]);

  return (
    <Stack gap="md">
      {/* Signature Type Selection */}
      <div>
        <Text size="sm" fw={500} mb="xs">
          {t('sign.type.title', 'Signature Type')}
        </Text>
        <ButtonSelector
          value={parameters.signatureType}
          onChange={(value) => onParameterChange('signatureType', value as 'image' | 'text' | 'draw')}
          options={[
            {
              value: 'draw',
              label: t('sign.type.draw', 'Draw'),
            },
            {
              value: 'image',
              label: t('sign.type.image', 'Image'),
            },
            {
              value: 'text',
              label: t('sign.type.text', 'Text'),
            },
          ]}
          disabled={disabled}
        />
      </div>

      {/* Signature Creation based on type */}
      {parameters.signatureType === 'draw' && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={500}>{t('sign.draw.title', 'Draw your signature')}</Text>
              <Button
                variant="subtle"
                color="red"
                size="compact-sm"
                onClick={clearCanvas}
                disabled={disabled}
              >
                {t('sign.draw.clear', 'Clear')}
              </Button>
            </Group>
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              style={{
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: disabled ? 'default' : 'crosshair',
                backgroundColor: '#ffffff',
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
            <Text size="sm" c="dimmed">
              {t('sign.draw.hint', 'Click and drag to draw your signature')}
            </Text>
          </Stack>
        </Paper>
      )}

      {parameters.signatureType === 'image' && (
        <Stack gap="sm">
          <FileInput
            label={t('sign.image.label', 'Upload signature image')}
            placeholder={t('sign.image.placeholder', 'Select image file')}
            accept="image/*"
            value={signatureImage}
            onChange={(file) => {
              console.log('FileInput onChange triggered with file:', file);
              handleSignatureImageChange(file);
            }}
            disabled={disabled}
          />
          <Text size="sm" c="dimmed">
            {t('sign.image.hint', 'Upload a PNG or JPG image of your signature')}
          </Text>
        </Stack>
      )}

      {parameters.signatureType === 'text' && (
        <Stack gap="sm">
          <TextInput
            label={t('sign.text.name', 'Signer Name')}
            placeholder={t('sign.text.placeholder', 'Enter your full name')}
            value={parameters.signerName || ''}
            onChange={(e) => onParameterChange('signerName', e.target.value)}
            disabled={disabled}
            required
          />
        </Stack>
      )}


      {/* Instructions for placing signature */}
      <Alert color="blue" title={t('sign.instructions.title', 'How to add signature')}>
        <Text size="sm">
          {parameters.signatureType === 'draw' && t('sign.instructions.draw', 'Draw your signature above, then click "Draw Directly on PDF" to draw live, or "Place Canvas Signature" to place your drawn signature.')}
          {parameters.signatureType === 'image' && t('sign.instructions.image', 'Upload your signature image above, then click "Activate Image Placement" to place it on the PDF.')}
          {parameters.signatureType === 'text' && t('sign.instructions.text', 'Enter your name above, then click "Activate Text Signature" to place it on the PDF.')}
        </Text>

        <Group mt="sm" gap="sm">
          {/* Universal activation button */}
          {((parameters.signatureType === 'draw' && parameters.signatureData) ||
            (parameters.signatureType === 'image' && parameters.signatureData) ||
            (parameters.signatureType === 'text' && parameters.signerName)) && (
            <Button
              onClick={() => {
                if (onActivateSignaturePlacement) {
                  onActivateSignaturePlacement();
                }
              }}
              disabled={disabled}
            >
              {t('sign.activate', 'Activate Signature Placement')}
            </Button>
          )}

          {/* Draw directly mode for draw type */}
          {parameters.signatureType === 'draw' && (
            <Button
              variant="outline"
              onClick={() => {
                if (onActivateDrawMode) {
                  onActivateDrawMode();
                }
              }}
              disabled={disabled}
            >
              {t('sign.activate.draw', 'Draw Directly on PDF')}
            </Button>
          )}

          {/* Universal deactivate button */}
          <Button
            variant="subtle"
            color="red"
            onClick={() => {
              if (onDeactivateSignature) {
                onDeactivateSignature();
              }
            }}
            disabled={disabled}
          >
            {t('sign.deactivate', 'Stop Placing Signatures')}
          </Button>
        </Group>

      </Alert>
    </Stack>
  );
};

export default SignSettings;
