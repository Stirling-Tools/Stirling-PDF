import React, { useState } from 'react';
import { Stack, Alert, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { DrawingControls } from './DrawingControls';
import { ColorPicker } from './ColorPicker';
import { usePDFAnnotation } from '../providers/PDFAnnotationProvider';

export interface AnnotationToolConfig {
  enableDrawing?: boolean;
  enableImageUpload?: boolean;
  enableTextInput?: boolean;
  showPlaceButton?: boolean;
  placeButtonText?: string;
}

interface BaseAnnotationToolProps {
  config: AnnotationToolConfig;
  children: React.ReactNode;
  onSignatureDataChange?: (data: string | null) => void;
  disabled?: boolean;
}

export const BaseAnnotationTool: React.FC<BaseAnnotationToolProps> = ({
  config,
  children,
  onSignatureDataChange,
  disabled = false
}) => {
  const { t } = useTranslation();
  const {
    activateSignaturePlacementMode,
    undo,
    redo
  } = usePDFAnnotation();

  const [selectedColor, setSelectedColor] = useState('#000000');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const handleSignatureDataChange = (data: string | null) => {
    setSignatureData(data);
    onSignatureDataChange?.(data);
  };

  const handlePlaceSignature = () => {
    if (activateSignaturePlacementMode) {
      activateSignaturePlacementMode();
    }
  };

  return (
    <Stack gap="md">
      {/* Drawing Controls (Undo/Redo/Place) */}
      <DrawingControls
        onUndo={undo}
        onRedo={redo}
        onPlaceSignature={config.showPlaceButton ? handlePlaceSignature : undefined}
        hasSignatureData={!!signatureData}
        disabled={disabled}
        showPlaceButton={config.showPlaceButton}
        placeButtonText={config.placeButtonText}
      />

      {/* Tool Content */}
      {React.cloneElement(children as React.ReactElement<any>, {
        selectedColor,
        signatureData,
        onSignatureDataChange: handleSignatureDataChange,
        onColorSwatchClick: () => setIsColorPickerOpen(true),
        disabled
      })}

      {/* Instructions for placing signature */}
      <Alert color="blue" title={t('sign.instructions.title', 'How to add signature')}>
        <Text size="sm">
          Click anywhere on the PDF to place your annotation.
        </Text>
      </Alert>

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
      />
    </Stack>
  );
};