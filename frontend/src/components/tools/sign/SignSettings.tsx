import { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { Stack, Button, Text, Alert, Tabs } from '@mantine/core';
import { SignParameters } from "../../../hooks/tools/sign/useSignParameters";
import { SuggestedToolsSection } from "../shared/SuggestedToolsSection";

// Import the new reusable components
import { DrawingCanvas } from "../../annotation/shared/DrawingCanvas";
import { DrawingControls } from "../../annotation/shared/DrawingControls";
import { ImageUploader } from "../../annotation/shared/ImageUploader";
import { TextInputWithFont } from "../../annotation/shared/TextInputWithFont";
import { ColorPicker } from "../../annotation/shared/ColorPicker";

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
  onSave?: () => void;
}

const SignSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  onActivateSignaturePlacement,
  onDeactivateSignature,
  onUndo,
  onRedo,
  onSave
}: SignSettingsProps) => {
  const { t } = useTranslation();

  // State for drawing
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  const [penSizeInput, setPenSizeInput] = useState('2');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // State for different signature types
  const [canvasSignatureData, setCanvasSignatureData] = useState<string | null>(null);
  const [imageSignatureData, setImageSignatureData] = useState<string | null>(null);

  // Handle image upload
  const handleImageChange = async (file: File | null) => {
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
        setImageSignatureData(result);
      } catch (error) {
        console.error('Error reading file:', error);
      }
    } else if (!file) {
      setImageSignatureData(null);
      if (onDeactivateSignature) {
        onDeactivateSignature();
      }
    }
  };

  // Handle signature data changes
  const handleCanvasSignatureChange = (data: string | null) => {
    setCanvasSignatureData(prev => {
      if (prev === data) return prev; // Prevent unnecessary updates
      return data;
    });
    if (data) {
      // Clear image data when canvas is used
      setImageSignatureData(null);
    }
  };

  // Handle signature mode deactivation when switching types
  useEffect(() => {
    if (parameters.signatureType !== 'text' && onDeactivateSignature) {
      onDeactivateSignature();
    }
  }, [parameters.signatureType]);

  // Handle text signature activation
  useEffect(() => {
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
  }, [parameters.signatureType, parameters.signerName, onActivateSignaturePlacement, onDeactivateSignature]);

  // Handle signature data updates
  useEffect(() => {
    let newSignatureData: string | undefined = undefined;

    if (parameters.signatureType === 'image' && imageSignatureData) {
      newSignatureData = imageSignatureData;
    } else if (parameters.signatureType === 'canvas' && canvasSignatureData) {
      newSignatureData = canvasSignatureData;
    }

    // Only update if the signature data has actually changed
    if (parameters.signatureData !== newSignatureData) {
      onParameterChange('signatureData', newSignatureData);
    }
  }, [parameters.signatureType, parameters.signatureData, canvasSignatureData, imageSignatureData]);

  // Handle image signature activation - activate when image data syncs with parameters
  useEffect(() => {
    if (parameters.signatureType === 'image' && imageSignatureData && parameters.signatureData === imageSignatureData && onActivateSignaturePlacement) {
      setTimeout(() => {
        onActivateSignaturePlacement();
      }, 100);
    }
  }, [parameters.signatureType, parameters.signatureData, imageSignatureData]);

  // Handle canvas signature activation - activate when canvas data syncs with parameters
  useEffect(() => {
    if (parameters.signatureType === 'canvas' && canvasSignatureData && parameters.signatureData === canvasSignatureData && onActivateSignaturePlacement) {
      setTimeout(() => {
        onActivateSignaturePlacement();
      }, 100);
    }
  }, [parameters.signatureType, parameters.signatureData, canvasSignatureData]);

  // Draw settings are no longer needed since draw mode is removed

  return (
    <Stack gap="md">
      {/* Signature Type Selection */}
      <Tabs
        value={parameters.signatureType}
        onChange={(value) => onParameterChange('signatureType', value as 'image' | 'text' | 'canvas')}
      >
        <Tabs.List grow>
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

      {/* Drawing Controls */}
      <DrawingControls
        onUndo={onUndo}
        onRedo={onRedo}
        onPlaceSignature={() => {
          if (onActivateSignaturePlacement) {
            onActivateSignaturePlacement();
          }
        }}
        hasSignatureData={!!(canvasSignatureData || imageSignatureData || (parameters.signerName && parameters.signerName.trim() !== ''))}
        disabled={disabled}
        showPlaceButton={false}
        placeButtonText="Update and Place"
      />

      {/* Signature Creation based on type */}
      {parameters.signatureType === 'canvas' && (
        <DrawingCanvas
          selectedColor={selectedColor}
          penSize={penSize}
          penSizeInput={penSizeInput}
          onColorSwatchClick={() => setIsColorPickerOpen(true)}
          onPenSizeChange={setPenSize}
          onPenSizeInputChange={setPenSizeInput}
          onSignatureDataChange={handleCanvasSignatureChange}
          onDrawingComplete={() => {
            if (onActivateSignaturePlacement) {
              onActivateSignaturePlacement();
            }
          }}
          disabled={disabled}
          additionalButtons={
            <Button
              onClick={() => {
                if (onActivateSignaturePlacement) {
                  onActivateSignaturePlacement();
                }
              }}
              color="blue"
              variant="filled"
              disabled={disabled || !canvasSignatureData}
            >
              Update and Place
            </Button>
          }
        />
      )}

      {parameters.signatureType === 'image' && (
        <ImageUploader
          onImageChange={handleImageChange}
          disabled={disabled}
        />
      )}

      {parameters.signatureType === 'text' && (
        <TextInputWithFont
          text={parameters.signerName || ''}
          onTextChange={(text) => onParameterChange('signerName', text)}
          fontSize={parameters.fontSize || 16}
          onFontSizeChange={(size) => onParameterChange('fontSize', size)}
          fontFamily={parameters.fontFamily || 'Helvetica'}
          onFontFamilyChange={(family) => onParameterChange('fontFamily', family)}
          disabled={disabled}
        />
      )}


      {/* Instructions for placing signature */}
      <Alert color="blue" title={t('sign.instructions.title', 'How to add signature')}>
        <Text size="sm">
          {parameters.signatureType === 'canvas' && 'After drawing your signature in the canvas above, click "Update and Place" then click anywhere on the PDF to place it.'}
          {parameters.signatureType === 'image' && 'After uploading your signature image above, click anywhere on the PDF to place it.'}
          {parameters.signatureType === 'text' && 'After entering your name above, click anywhere on the PDF to place your signature.'}
        </Text>
      </Alert>

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
      />

      {/* Apply Signatures Button */}
      {onSave && (
        <Button
          onClick={onSave}
          color="blue"
          variant="filled"
          fullWidth
        >
          {t('sign.applySignatures', 'Apply Signatures')}
        </Button>
      )}

      {/* Suggested Tools Section */}
      <SuggestedToolsSection />
    </Stack>
  );
};

export default SignSettings;
