import React, { useState } from 'react';
import { Stack } from '@mantine/core';
import { BaseAnnotationTool } from '@app/components/annotation/shared/BaseAnnotationTool';
import { TextInputWithFont } from '@app/components/annotation/shared/TextInputWithFont';

interface TextToolProps {
  onTextChange?: (text: string) => void;
  disabled?: boolean;
}

export const TextTool: React.FC<TextToolProps> = ({
  onTextChange,
  disabled = false
}) => {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Helvetica');

  const handleTextChange = (newText: string) => {
    setText(newText);
    onTextChange?.(newText);
  };

  const handleSignatureDataChange = (data: string | null) => {
    if (data) {
      onTextChange?.(data);
    }
  };

  const toolConfig = {
    enableTextInput: true,
    showPlaceButton: true,
    placeButtonText: "Place Text"
  };

  return (
    <BaseAnnotationTool
      config={toolConfig}
      onSignatureDataChange={handleSignatureDataChange}
      disabled={disabled}
    >
      <Stack gap="sm">
        <TextInputWithFont
          text={text}
          onTextChange={handleTextChange}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          disabled={disabled}
          label="Text Content"
          placeholder="Enter text to place on the PDF"
        />
      </Stack>
    </BaseAnnotationTool>
  );
};