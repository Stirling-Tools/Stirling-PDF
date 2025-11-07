import React, { useState } from 'react';
import { Stack } from '@mantine/core';
import { BaseAnnotationTool } from '@app/components/annotation/shared/BaseAnnotationTool';
import { DrawingCanvas } from '@app/components/annotation/shared/DrawingCanvas';

interface DrawingToolProps {
  onDrawingChange?: (data: string | null) => void;
  disabled?: boolean;
}

export const DrawingTool: React.FC<DrawingToolProps> = ({
  onDrawingChange,
  disabled = false
}) => {
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
      {({ selectedColor, onColorSwatchClick, onSignatureDataChange }) => (
        <Stack gap="sm">
          <DrawingCanvas
            selectedColor={selectedColor}
            penSize={penSize}
            penSizeInput={penSizeInput}
            onColorSwatchClick={onColorSwatchClick}
            onPenSizeChange={setPenSize}
            onPenSizeInputChange={setPenSizeInput}
            onSignatureDataChange={onSignatureDataChange}
            disabled={disabled}
          />
        </Stack>
      )}
    </BaseAnnotationTool>
  );
};
