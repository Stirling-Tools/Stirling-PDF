import React, { useState, useEffect } from 'react';
import { Stack, Button } from '@mantine/core';
import { TextInputWithFont } from '@app/components/annotation/shared/TextInputWithFont';
import { useSignature } from '@app/contexts/SignatureContext';

interface TextToolProps {
  onTextChange?: (text: string) => void;
  disabled?: boolean;
}

const textAlignToNumber = (align: 'left' | 'center' | 'right'): number => {
  switch (align) {
    case 'left': return 0;
    case 'center': return 1;
    case 'right': return 2;
  }
};

export const TextTool: React.FC<TextToolProps> = ({
  onTextChange,
  disabled = false
}) => {
  const { signatureApiRef } = useSignature();
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [textColor, setTextColor] = useState('#000000');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');

  const handleTextChange = (newText: string) => {
    setText(newText);
    onTextChange?.(newText);
  };

  const handlePlaceText = () => {
    const api = signatureApiRef?.current;
    if (api && text) {
      api.activateAnnotationTool?.('text', {
        color: textColor,
        fontSize,
        fontFamily,
        textAlign: textAlignToNumber(textAlign),
        contents: text,
      });
    }
  };

  return (
    <Stack gap="md">
      <TextInputWithFont
        text={text}
        onTextChange={handleTextChange}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        fontFamily={fontFamily}
        onFontFamilyChange={setFontFamily}
        textColor={textColor}
        onTextColorChange={setTextColor}
        textAlign={textAlign}
        onTextAlignChange={setTextAlign}
        disabled={disabled}
        label="Text Content"
        placeholder="Enter text to place on the PDF"
      />
      <Button
        onClick={handlePlaceText}
        disabled={disabled || !text.trim()}
        fullWidth
      >
        Place Text
      </Button>
    </Stack>
  );
};