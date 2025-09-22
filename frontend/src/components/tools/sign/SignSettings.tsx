import React, { useRef, useState } from 'react';
import { useTranslation } from "react-i18next";
import { Stack, TextInput, FileInput, Paper, Group, Button, Text, Alert, Modal, ColorSwatch, Menu, ActionIcon, Slider } from '@mantine/core';
import ButtonSelector from "../../shared/ButtonSelector";
import { SignParameters } from "../../../hooks/tools/sign/useSignParameters";

interface SignSettingsProps {
  parameters: SignParameters;
  onParameterChange: <K extends keyof SignParameters>(key: K, value: SignParameters[K]) => void;
  disabled?: boolean;
  onActivateDrawMode?: () => void;
  onActivateSignaturePlacement?: () => void;
  onDeactivateSignature?: () => void;
  onUpdateDrawSettings?: (color: string, size: number) => void;
}

const SignSettings = ({ parameters, onParameterChange, disabled = false, onActivateDrawMode, onActivateSignaturePlacement, onDeactivateSignature, onUpdateDrawSettings }: SignSettingsProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState<File | null>(null);
  const [canvasSignatureData, setCanvasSignatureData] = useState<string | null>(null);
  const [imageSignatureData, setImageSignatureData] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isModalDrawing, setIsModalDrawing] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);

  // Drawing functions for signature canvas
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
  };

  const stopDrawing = () => {
    if (!isDrawing || disabled) return;

    setIsDrawing(false);

    // Save canvas as signature data
    if (canvasRef.current) {
      const dataURL = canvasRef.current.toDataURL('image/png');
      console.log('Saving canvas signature data:', dataURL.substring(0, 50) + '...');
      setCanvasSignatureData(dataURL);
      onParameterChange('signatureData', dataURL);

      // Auto-activate placement mode after drawing
      setTimeout(() => {
        if (onActivateSignaturePlacement) {
          onActivateSignaturePlacement();
        }
      }, 100);
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current || disabled) return;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setCanvasSignatureData(null);
      onParameterChange('signatureData', undefined);
    }
  };

  // Modal canvas drawing functions
  const startModalDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!modalCanvasRef.current) return;

    setIsModalDrawing(true);
    const rect = modalCanvasRef.current.getBoundingClientRect();
    const scaleX = modalCanvasRef.current.width / rect.width;
    const scaleY = modalCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = modalCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = selectedColor;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const drawModal = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isModalDrawing || !modalCanvasRef.current) return;

    const rect = modalCanvasRef.current.getBoundingClientRect();
    const scaleX = modalCanvasRef.current.width / rect.width;
    const scaleY = modalCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = modalCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopModalDrawing = () => {
    if (!isModalDrawing) return;
    setIsModalDrawing(false);
  };

  const clearModalCanvas = () => {
    if (!modalCanvasRef.current) return;

    const ctx = modalCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height);
    }
  };

  const saveModalSignature = () => {
    if (!modalCanvasRef.current) return;

    const dataURL = modalCanvasRef.current.toDataURL('image/png');
    setCanvasSignatureData(dataURL);
    onParameterChange('signatureData', dataURL);

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

    // Auto-activate placement mode after saving modal signature
    setTimeout(() => {
      if (onActivateSignaturePlacement) {
        onActivateSignaturePlacement();
      }
    }, 100);
  };

  // Handle signature image upload
  const handleSignatureImageChange = (file: File | null) => {
    console.log('Image file selected:', file);
    if (file && !disabled) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          console.log('Image loaded, saving to signatureData, length:', (e.target.result as string).length);
          setImageSignatureData(e.target.result as string);
          onParameterChange('signatureData', e.target.result as string);

          // Auto-activate placement mode after image upload
          setTimeout(() => {
            if (onActivateSignaturePlacement) {
              onActivateSignaturePlacement();
            }
          }, 100);
        }
      };
      reader.readAsDataURL(file);
      setSignatureImage(file);
    }
  };

  // Initialize canvas
  React.useEffect(() => {
    if (canvasRef.current && parameters.signatureType === 'canvas') {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [parameters.signatureType, selectedColor]);

  // Initialize modal canvas when opened
  React.useEffect(() => {
    if (modalCanvasRef.current && isModalOpen) {
      const ctx = modalCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [isModalOpen, selectedColor]);

  // Switch signature data based on mode
  React.useEffect(() => {
    if (parameters.signatureType === 'canvas' && canvasSignatureData) {
      onParameterChange('signatureData', canvasSignatureData);
    } else if (parameters.signatureType === 'image' && imageSignatureData) {
      onParameterChange('signatureData', imageSignatureData);
    }
  }, [parameters.signatureType, canvasSignatureData, imageSignatureData, onParameterChange]);

  // Auto-activate draw mode when draw type is selected (only trigger on signatureType change)
  React.useEffect(() => {
    if (parameters.signatureType === 'draw') {
      if (onActivateDrawMode) {
        onActivateDrawMode();
      }
    } else if (parameters.signatureType !== 'draw') {
      if (onDeactivateSignature) {
        onDeactivateSignature();
      }
    }
  }, [parameters.signatureType]); // Only depend on signatureType to avoid loops

  // Update draw settings when color or pen size changes
  React.useEffect(() => {
    console.log('SignSettings: Draw settings changed - color:', selectedColor, 'penSize:', penSize, 'signatureType:', parameters.signatureType);
    if (parameters.signatureType === 'draw' && onUpdateDrawSettings) {
      console.log('SignSettings: Calling onUpdateDrawSettings');
      onUpdateDrawSettings(selectedColor, penSize);
    } else {
      console.log('SignSettings: Not calling onUpdateDrawSettings - signatureType not draw or function not available');
    }
  }, [selectedColor, penSize, parameters.signatureType, onUpdateDrawSettings]);

  return (
    <Stack gap="md">
      {/* Signature Type Selection */}
      <div>
        <Text size="sm" fw={500} mb="xs">
          {t('sign.type.title', 'Signature Type')}
        </Text>
        <ButtonSelector
          value={parameters.signatureType}
          onChange={(value) => onParameterChange('signatureType', value as 'image' | 'text' | 'draw' | 'canvas')}
          options={[
            {
              value: 'draw',
              label: t('sign.type.draw', 'Draw'),
            },
            {
              value: 'canvas',
              label: t('sign.type.canvas', 'Canvas'),
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
      {parameters.signatureType === 'canvas' && (
        <Paper withBorder p="md" style={{ position: 'relative' }}>
          <ActionIcon
            variant="filled"
            color="blue"
            size="sm"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
            }}
            onClick={() => setIsModalOpen(true)}
            disabled={disabled}
            title="Expand Canvas"
          >
            +
          </ActionIcon>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={500}>{t('sign.draw.title', 'Draw your signature')}</Text>
              <Group gap="sm">
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      disabled={disabled}
                      rightSection={
                        <ColorSwatch
                          color={selectedColor}
                          size={12}
                        />
                      }
                    >
                      Color
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Select Color</Menu.Label>
                    <Group gap="xs" p="xs">
                      {['#000000', '#0066cc', '#cc0000', '#cc6600', '#009900', '#6600cc'].map((color) => (
                        <ColorSwatch
                          key={color}
                          color={color}
                          size={24}
                          style={{
                            cursor: 'pointer',
                            border: selectedColor === color ? '2px solid #333' : '1px solid #ddd'
                          }}
                          onClick={() => setSelectedColor(color)}
                        />
                      ))}
                    </Group>
                  </Menu.Dropdown>
                </Menu>
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
                width: '100%',
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
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

      {/* Direct PDF Drawing */}
      {parameters.signatureType === 'draw' && (
        <Paper withBorder p="md">
          <Stack gap="md">
            <Text fw={500}>Direct PDF Drawing</Text>
            <Text size="sm" c="dimmed">
              Draw signatures and annotations directly on the PDF document. Drawing mode will be activated automatically when you go to the PDF viewer.
            </Text>

            {/* Drawing Controls */}
            <Group gap="md" align="flex-end">
              {/* Color Picker */}
              <div>
                <Text size="sm" fw={500} mb="xs">Color</Text>
                <Group gap="xs">
                  {['#000000', '#0066cc', '#cc0000', '#cc6600', '#009900', '#6600cc'].map((color) => (
                    <ColorSwatch
                      key={color}
                      color={color}
                      size={24}
                      style={{
                        cursor: 'pointer',
                        border: selectedColor === color ? '2px solid #333' : '1px solid #ddd'
                      }}
                      onClick={() => setSelectedColor(color)}
                    />
                  ))}
                </Group>
              </div>

              {/* Pen Size */}
              <div style={{ flexGrow: 1, maxWidth: '200px' }}>
                <Text size="sm" fw={500} mb="xs">Pen Size: {penSize}px</Text>
                <Slider
                  value={penSize}
                  onChange={setPenSize}
                  min={1}
                  max={10}
                  step={1}
                  marks={[
                    { value: 1, label: '1' },
                    { value: 5, label: '5' },
                    { value: 10, label: '10' }
                  ]}
                />
              </div>
            </Group>
          </Stack>
        </Paper>
      )}


      {/* Instructions for placing signature */}
      {(parameters.signatureType === 'canvas' || parameters.signatureType === 'image' || parameters.signatureType === 'text') && (
        <Alert color="blue" title={t('sign.instructions.title', 'How to add signature')}>
          <Text size="sm">
            {parameters.signatureType === 'canvas' && 'Draw your signature in the canvas above. Placement mode will activate automatically, or click the buttons below to control placement.'}
            {parameters.signatureType === 'image' && 'Upload your signature image above. Placement mode will activate automatically, or click the buttons below to control placement.'}
            {parameters.signatureType === 'text' && 'Enter your name above. Placement mode will activate automatically, or click the buttons below to control placement.'}
          </Text>

          <Group mt="sm" gap="sm">
            {/* Universal activation button */}
            {((parameters.signatureType === 'canvas' && parameters.signatureData) ||
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
      )}

      {/* Modal for larger signature canvas */}
      <Modal
        opened={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Draw Your Signature"
        size="xl"
        centered
      >
        <Stack gap="md">
          {/* Color picker */}
          <Paper withBorder p="sm">
            <Group gap="sm" align="center">
              <Text size="sm" fw={500}>Color:</Text>
              {['#000000', '#0066cc', '#cc0000', '#cc6600', '#009900', '#6600cc'].map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  size={24}
                  style={{ cursor: 'pointer', border: selectedColor === color ? '2px solid #333' : 'none' }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </Group>
          </Paper>

          <Paper withBorder p="md">
            <canvas
              ref={modalCanvasRef}
              width={800}
              height={400}
              style={{
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'crosshair',
                backgroundColor: '#ffffff',
                width: '100%',
                maxWidth: '800px',
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
    </Stack>
  );
};

export default SignSettings;
