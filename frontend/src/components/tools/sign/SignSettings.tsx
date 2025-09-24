import React, { useRef, useState } from 'react';
import { useTranslation } from "react-i18next";
import { Stack, TextInput, FileInput, Paper, Group, Button, Text, Alert, Modal, ColorSwatch, Menu, ActionIcon, Slider, Select, Combobox, useCombobox, ColorPicker, Tabs } from '@mantine/core';
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
  onUndo?: () => void;
  onRedo?: () => void;
}

const SignSettings = ({ parameters, onParameterChange, disabled = false, onActivateDrawMode, onActivateSignaturePlacement, onDeactivateSignature, onUpdateDrawSettings, onUndo, onRedo }: SignSettingsProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasSignatureData, setCanvasSignatureData] = useState<string | null>(null);
  const [imageSignatureData, setImageSignatureData] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const visibleModalCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isModalDrawing, setIsModalDrawing] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  const [penSizeInput, setPenSizeInput] = useState('2');
  const [fontSizeInput, setFontSizeInput] = useState((parameters.fontSize || 16).toString());
  const fontSizeCombobox = useCombobox();
  const penSizeCombobox = useCombobox();
  const modalPenSizeCombobox = useCombobox();

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
      ctx.lineWidth = penSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
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

      // Update signature data immediately after each stroke
      const dataURL = canvasRef.current.toDataURL('image/png');
      setCanvasSignatureData(dataURL);
      onParameterChange('signatureData', dataURL);
    }
  };

  const stopDrawing = () => {
    if (!isDrawing || disabled) return;

    setIsDrawing(false);

    // Save canvas as signature data
    if (canvasRef.current) {
      const dataURL = canvasRef.current.toDataURL('image/png');
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

      // Also clear the modal canvas if it exists
      if (modalCanvasRef.current) {
        const modalCtx = modalCanvasRef.current.getContext('2d');
        if (modalCtx) {
          modalCtx.clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height);
        }
      }

      setCanvasSignatureData(null);
      onParameterChange('signatureData', undefined);

      // Deactivate signature placement when cleared
      if (onDeactivateSignature) {
        onDeactivateSignature();
      }
    }
  };

  // Modal canvas drawing functions
  const startModalDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
  };

  const drawModal = (e: React.MouseEvent<HTMLCanvasElement>) => {
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

    // Update signature data from hidden canvas (consistent size)
    const dataURL = modalCanvasRef.current.toDataURL('image/png');
    setCanvasSignatureData(dataURL);
    onParameterChange('signatureData', dataURL);

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

      // Also clear the main canvas and signature data
      if (canvasRef.current) {
        const mainCtx = canvasRef.current.getContext('2d');
        if (mainCtx) {
          mainCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }

      setCanvasSignatureData(null);
      onParameterChange('signatureData', undefined);

      // Deactivate signature placement when cleared
      if (onDeactivateSignature) {
        onDeactivateSignature();
      }
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
  const handleSignatureImageChange = async (file: File | null) => {
    console.log('Image file selected:', file);
    if (file && !disabled) {
      try {
        const result = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              resolve(e.target.result as string);
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        // Clear any existing canvas signatures when uploading image
        setCanvasSignatureData(null);

        // Set as active signature immediately
        setImageSignatureData(result);

      } catch (error) {
        console.error('Error reading file:', error);
      }
    } else if (!file) {
      // Clear image data when no file is selected
      setImageSignatureData(null);
      // Deactivate signature placement when image is removed
      if (onDeactivateSignature) {
        onDeactivateSignature();
      }
    }
  };

  // Initialize canvas
  React.useEffect(() => {
    if (canvasRef.current && parameters.signatureType === 'canvas') {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = penSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [parameters.signatureType, selectedColor, penSize]);

  // Initialize both canvases - hidden one always exists, main one when in canvas mode
  React.useEffect(() => {
    const initCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = penSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };

    if (parameters.signatureType === 'canvas') {
      initCanvas(canvasRef.current);
      initCanvas(modalCanvasRef.current); // Hidden canvas always available
    }
  }, [parameters.signatureType, selectedColor, penSize]);

  // Copy main canvas content to hidden modal canvas whenever signature data changes
  React.useEffect(() => {
    if (modalCanvasRef.current && canvasSignatureData) {
      const hiddenCtx = modalCanvasRef.current.getContext('2d');
      if (hiddenCtx) {
        const img = new Image();
        img.onload = () => {
          if (modalCanvasRef.current) {
            hiddenCtx.clearRect(0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height);
            hiddenCtx.drawImage(img, 0, 0, modalCanvasRef.current.width, modalCanvasRef.current.height);
          }
        };
        img.src = canvasSignatureData;
      }
    }
  }, [canvasSignatureData]);


  // Switch signature data based on mode
  React.useEffect(() => {
    if (parameters.signatureType === 'canvas') {
      if (canvasSignatureData) {
        onParameterChange('signatureData', canvasSignatureData);
      } else {
        onParameterChange('signatureData', undefined);
      }
    } else if (parameters.signatureType === 'image') {
      if (imageSignatureData) {
        onParameterChange('signatureData', imageSignatureData);
        // Activate signature placement mode when image is ready
        if (onActivateSignaturePlacement) {
          onActivateSignaturePlacement();
        }
      } else {
        onParameterChange('signatureData', undefined);
      }
    } else if (parameters.signatureType === 'text') {
      // For text mode, we don't use signatureData - we use signerName directly
      onParameterChange('signatureData', undefined);
    } else {
      // For draw mode, clear signature data
      onParameterChange('signatureData', undefined);
    }
  }, [parameters.signatureType, canvasSignatureData, imageSignatureData]);

  // Initialize draw mode on mount
  React.useEffect(() => {
    // Use a ref to track if we've already initialized
    let isInitialized = false;

    if (parameters.signatureType === 'draw' && onActivateDrawMode && !isInitialized) {
      // Delay to ensure viewer is ready
      const timer = setTimeout(() => {
        onActivateDrawMode();
        isInitialized = true;
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, []); // Empty dependency - only run on mount

  // Auto-activate draw mode when draw type is selected
  React.useEffect(() => {
    if (parameters.signatureType === 'draw') {
      if (onActivateDrawMode) {
        onActivateDrawMode();
      }
    } else {
      if (onDeactivateSignature) {
        onDeactivateSignature();
      }
    }
  }, [parameters.signatureType]); // Only depend on signatureType to avoid loops

  // Auto-activate text signature placement when signer name is entered
  React.useEffect(() => {
    if (parameters.signatureType === 'text' && parameters.signerName && parameters.signerName.trim() !== '') {
      if (onActivateSignaturePlacement) {
        setTimeout(() => {
          onActivateSignaturePlacement();
        }, 100);
      }
    } else if (parameters.signatureType === 'text' && (!parameters.signerName || parameters.signerName.trim() === '')) {
      if (onDeactivateSignature) {
        onDeactivateSignature();
      }
    }
  }, [parameters.signatureType, parameters.signerName]); // Remove function dependencies to prevent loops

  // Update draw settings when color or pen size changes
  React.useEffect(() => {
    if (parameters.signatureType === 'draw' && onUpdateDrawSettings) {
      onUpdateDrawSettings(selectedColor, penSize);
    }
  }, [selectedColor, penSize, parameters.signatureType]); // Remove function dependency to prevent loops

  // Sync font size input with parameter changes
  React.useEffect(() => {
    setFontSizeInput((parameters.fontSize || 16).toString());
  }, [parameters.fontSize]);

  // Update signature config when font settings change
  React.useEffect(() => {
    if (parameters.signatureType === 'text' && (parameters.fontFamily || parameters.fontSize)) {
      // Trigger re-activation of signature placement to apply new font settings
      if (parameters.signerName && parameters.signerName.trim() !== '' && onActivateSignaturePlacement) {
        setTimeout(() => {
          onActivateSignaturePlacement();
        }, 100);
      }
    }
  }, [parameters.fontFamily, parameters.fontSize, parameters.signatureType, parameters.signerName]); // Remove function dependency to prevent loops

  return (
    <Stack gap="md">
      {/* Signature Type Selection */}
      <Tabs
        value={parameters.signatureType}
        onChange={(value) => onParameterChange('signatureType', value as 'image' | 'text' | 'draw' | 'canvas')}
      >
        <Tabs.List grow>
          <Tabs.Tab value="draw" style={{ fontSize: '0.8rem' }}>
            {t('sign.type.draw', 'Draw')}
          </Tabs.Tab>
          <Tabs.Tab value="canvas" style={{ fontSize: '0.8rem' }}>
            {t('sign.type.canvas', 'Canvas')}
          </Tabs.Tab>
          <Tabs.Tab value="image" style={{ fontSize: '0.8rem' }}>
            {t('sign.type.image', 'Image')}
          </Tabs.Tab>
          <Tabs.Tab value="text" style={{ fontSize: '0.8rem' }}>
            {t('sign.type.text', 'Text')}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* Undo/Redo Controls */}
      <Group justify="space-between" grow>
        <Button
          variant="outline"
          onClick={onUndo}
          disabled={disabled}
        >
          {t('sign.undo', 'Undo')}
        </Button>
        <Button
          variant="outline"
          onClick={onRedo}
          disabled={disabled}
        >
          {t('sign.redo', 'Redo')}
        </Button>
      </Group>

      {/* Signature Creation based on type */}
      {parameters.signatureType === 'canvas' && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={500}>{t('sign.draw.title', 'Draw your signature')}</Text>
              <Group gap="lg">
                <div>
                  <Text size="sm" fw={500} mb="xs" ta="center">Color</Text>
                  <Group justify="center">
                    <ColorSwatch
                      color={selectedColor}
                      size={24}
                      radius={0}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setIsColorPickerOpen(true)}
                    />
                  </Group>
                </div>
                <div>
                  <Text size="sm" fw={500} mb="xs">Pen Size</Text>
                  <Combobox
                    onOptionSubmit={(optionValue) => {
                      const size = parseInt(optionValue);
                      if (!isNaN(size)) {
                        setPenSize(size);
                        setPenSizeInput(optionValue);
                      }
                      penSizeCombobox.closeDropdown();
                    }}
                    store={penSizeCombobox}
                    withinPortal={false}
                  >
                    <Combobox.Target>
                      <TextInput
                        placeholder="Size"
                        size="compact-sm"
                        value={penSizeInput}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setPenSizeInput(value);

                          const size = parseInt(value);
                          if (!isNaN(size) && size >= 1 && size <= 200) {
                            setPenSize(size);
                          }

                          penSizeCombobox.openDropdown();
                          penSizeCombobox.updateSelectedOptionIndex();
                        }}
                        onClick={() => penSizeCombobox.openDropdown()}
                        onFocus={() => penSizeCombobox.openDropdown()}
                        onBlur={() => {
                          penSizeCombobox.closeDropdown();
                          const size = parseInt(penSizeInput);
                          if (isNaN(size) || size < 1 || size > 200) {
                            setPenSizeInput(penSize.toString());
                          }
                        }}
                        disabled={disabled}
                        style={{ width: '60px' }}
                      />
                    </Combobox.Target>

                    <Combobox.Dropdown>
                      <Combobox.Options>
                        {['1', '2', '3', '4', '5', '8', '10', '12', '15', '20', '25', '30', '40', '50'].map((size) => (
                          <Combobox.Option value={size} key={size}>
                            {size}px
                          </Combobox.Option>
                        ))}
                      </Combobox.Options>
                    </Combobox.Dropdown>
                  </Combobox>
                </div>
                <div style={{ paddingTop: '24px' }}>
                  <Button
                    variant="light"
                    size="compact-sm"
                    onClick={() => {
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
                  }}
                  disabled={disabled}
                >
                  Expand
                </Button>
                </div>
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
            <Group justify="flex-end">
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
          </Stack>
        </Paper>
      )}

      {parameters.signatureType === 'image' && (
        <Stack gap="sm">
          <FileInput
            label={t('sign.image.label', 'Upload signature image')}
            placeholder={t('sign.image.placeholder', 'Select image file')}
            accept="image/*"
            onChange={handleSignatureImageChange}
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

          {/* Font Selection */}
          <Select
            label="Font"
            value={parameters.fontFamily || 'Helvetica'}
            onChange={(value) => onParameterChange('fontFamily', value || 'Helvetica')}
            data={[
              { value: 'Helvetica', label: 'Helvetica' },
              { value: 'Times-Roman', label: 'Times' },
              { value: 'Courier', label: 'Courier' },
              { value: 'Arial', label: 'Arial' },
              { value: 'Georgia', label: 'Georgia' },
            ]}
            disabled={disabled}
            searchable
            allowDeselect={false}
          />

          {/* Font Size */}
          <Combobox
            onOptionSubmit={(optionValue) => {
              setFontSizeInput(optionValue);
              const size = parseInt(optionValue);
              if (!isNaN(size)) {
                onParameterChange('fontSize', size);
              }
              fontSizeCombobox.closeDropdown();
            }}
            store={fontSizeCombobox}
            withinPortal={false}
          >
            <Combobox.Target>
              <TextInput
                label="Font Size"
                placeholder="Type or select font size (8-72)"
                value={fontSizeInput}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFontSizeInput(value);

                  // Parse and validate the typed value in real-time
                  const size = parseInt(value);
                  if (!isNaN(size) && size >= 8 && size <= 72) {
                    onParameterChange('fontSize', size);
                  }

                  fontSizeCombobox.openDropdown();
                  fontSizeCombobox.updateSelectedOptionIndex();
                }}
                onClick={() => fontSizeCombobox.openDropdown()}
                onFocus={() => fontSizeCombobox.openDropdown()}
                onBlur={() => {
                  fontSizeCombobox.closeDropdown();
                  // Clean up invalid values on blur
                  const size = parseInt(fontSizeInput);
                  if (isNaN(size) || size < 8 || size > 72) {
                    setFontSizeInput((parameters.fontSize || 16).toString());
                  }
                }}
                disabled={disabled}
              />
            </Combobox.Target>

            <Combobox.Dropdown>
              <Combobox.Options>
                {['8', '12', '16', '20', '24', '28', '32', '36', '40', '48'].map((size) => (
                  <Combobox.Option value={size} key={size}>
                    {size}px
                  </Combobox.Option>
                ))}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </Stack>
      )}

      {/* Direct PDF Drawing */}
      {parameters.signatureType === 'draw' && (
        <Paper withBorder p="md">
          <Stack gap="md">
            <Text fw={500}>Direct PDF Drawing</Text>
            <Text size="sm" c="dimmed">
              Draw signatures and annotations directly on the PDF document.
            </Text>

            {/* Drawing Controls */}
            <Group gap="md" align="flex-end">
              {/* Color Picker */}
              <ColorSwatch
                color={selectedColor}
                size={24}
                radius={0}
                style={{ cursor: 'pointer' }}
                onClick={() => setIsColorPickerOpen(true)}
              />

              {/* Pen Size */}
              <div style={{ flexGrow: 1, maxWidth: '200px' }}>
                <Text size="sm" fw={500} mb="xs">Pen Size</Text>
                <Combobox
                  onOptionSubmit={(optionValue) => {
                    const size = parseInt(optionValue);
                    if (!isNaN(size)) {
                      setPenSize(size);
                      setPenSizeInput(optionValue);
                    }
                    penSizeCombobox.closeDropdown();
                  }}
                  store={penSizeCombobox}
                  withinPortal={false}
                >
                  <Combobox.Target>
                    <TextInput
                      placeholder="Type or select pen size (1-200)"
                      value={penSizeInput}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setPenSizeInput(value);

                        const size = parseInt(value);
                        if (!isNaN(size) && size >= 1 && size <= 200) {
                          setPenSize(size);
                        }

                        penSizeCombobox.openDropdown();
                        penSizeCombobox.updateSelectedOptionIndex();
                      }}
                      onClick={() => penSizeCombobox.openDropdown()}
                      onFocus={() => penSizeCombobox.openDropdown()}
                      onBlur={() => {
                        penSizeCombobox.closeDropdown();
                        const size = parseInt(penSizeInput);
                        if (isNaN(size) || size < 1 || size > 200) {
                          setPenSizeInput(penSize.toString());
                        }
                      }}
                      disabled={disabled}
                    />
                  </Combobox.Target>

                  <Combobox.Dropdown>
                    <Combobox.Options>
                      {['1', '2', '3', '4', '5', '8', '10', '12', '15', '20', '25', '30', '40', '50'].map((size) => (
                        <Combobox.Option value={size} key={size}>
                          {size}px
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                  </Combobox.Dropdown>
                </Combobox>
              </div>
            </Group>
          </Stack>
        </Paper>
      )}


      {/* Instructions for placing signature */}
      {(parameters.signatureType === 'canvas' || parameters.signatureType === 'image' || parameters.signatureType === 'text') && (
        <Alert color="blue" title={t('sign.instructions.title', 'How to add signature')}>
          <Text size="sm">
            {parameters.signatureType === 'canvas' && 'After drawing your signature in the canvas above, click anywhere on the PDF to place it.'}
            {parameters.signatureType === 'image' && 'After uploading your signature image above, click anywhere on the PDF to place it.'}
            {parameters.signatureType === 'text' && 'After entering your name above, click anywhere on the PDF to place your signature.'}
          </Text>
        </Alert>
      )}

      {/* Hidden canvas for modal synchronization - always exists */}
      <canvas
        ref={modalCanvasRef}
        width={800}
        height={400}
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
                <ColorSwatch
                  color={selectedColor}
                  size={24}
                  radius={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setIsColorPickerOpen(true)}
                />
              </div>
              <div>
                <Text size="sm" fw={500} mb="xs">Pen Size</Text>
                <Combobox
                  onOptionSubmit={(optionValue) => {
                    const size = parseInt(optionValue);
                    if (!isNaN(size)) {
                      setPenSize(size);
                      setPenSizeInput(optionValue);
                    }
                    modalPenSizeCombobox.closeDropdown();
                  }}
                  store={modalPenSizeCombobox}
                  withinPortal={false}
                >
                  <Combobox.Target>
                    <TextInput
                      placeholder="Size"
                      size="compact-sm"
                      value={penSizeInput}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setPenSizeInput(value);

                        const size = parseInt(value);
                        if (!isNaN(size) && size >= 1 && size <= 200) {
                          setPenSize(size);
                        }

                        modalPenSizeCombobox.openDropdown();
                        modalPenSizeCombobox.updateSelectedOptionIndex();
                      }}
                      onClick={() => modalPenSizeCombobox.openDropdown()}
                      onFocus={() => modalPenSizeCombobox.openDropdown()}
                      onBlur={() => {
                        modalPenSizeCombobox.closeDropdown();
                        const size = parseInt(penSizeInput);
                        if (isNaN(size) || size < 1 || size > 200) {
                          setPenSizeInput(penSize.toString());
                        }
                      }}
                      style={{ width: '60px' }}
                    />
                  </Combobox.Target>

                  <Combobox.Dropdown>
                    <Combobox.Options>
                      {['1', '2', '3', '4', '5', '8', '10', '12', '15', '20', '25', '30', '40', '50'].map((size) => (
                        <Combobox.Option value={size} key={size}>
                          {size}px
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                  </Combobox.Dropdown>
                </Combobox>
              </div>
            </Group>
          </Paper>

          <Paper withBorder p="md">
            <canvas
              ref={visibleModalCanvasRef}
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

      {/* Color Picker Modal */}
      <Modal
        opened={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        title="Choose Color"
        size="sm"
        centered
      >
        <Stack gap="md">
          <ColorPicker
            format="hex"
            value={selectedColor}
            onChange={setSelectedColor}
            swatches={['#000000', '#0066cc', '#cc0000', '#cc6600', '#009900', '#6600cc']}
            swatchesPerRow={6}
            size="lg"
            fullWidth
          />
          <Group justify="flex-end">
            <Button onClick={() => setIsColorPickerOpen(false)}>
              Done
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default SignSettings;
