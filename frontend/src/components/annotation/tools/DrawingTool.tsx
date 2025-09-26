import React, { useState } from 'react';
import { Stack, Paper, Text, Group } from '@mantine/core';
import { BaseAnnotationTool } from '../shared/BaseAnnotationTool';
import { DrawingCanvas } from '../shared/DrawingCanvas';
import { ColorSwatchButton } from '../shared/ColorPicker';
import PenSizeSelector from '../../tools/sign/PenSizeSelector';

interface DrawingToolProps {
  onDrawingChange?: (data: string | null) => void;
  disabled?: boolean;
}

export const DrawingTool: React.FC<DrawingToolProps> = ({
  onDrawingChange,
  disabled = false
}) => {
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  const [penSizeInput, setPenSizeInput] = useState('2');

  const toolConfig = {
    enableDrawing: true,
    showPlaceButton: true,
    placeButtonText: "Place Drawing"
  };

  return (
    <BaseAnnotationTool
      config={toolConfig}
      onSignatureDataChange={onDrawingChange}
      disabled={disabled}
    >
      <Stack gap="sm">
        <DrawingCanvas
          selectedColor={selectedColor}
          penSize={penSize}
          penSizeInput={penSizeInput}
          onColorSwatchClick={() => {}} // Color picker handled by BaseAnnotationTool
          onPenSizeChange={setPenSize}
          onPenSizeInputChange={setPenSizeInput}
          onSignatureDataChange={onDrawingChange || (() => {})}
          disabled={disabled}
        />
      </Stack>
    </BaseAnnotationTool>
  );
};