import React from 'react';
import { FileInput, Text, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PrivateContent } from '@app/components/shared/PrivateContent';

interface ImageUploaderProps {
  onImageChange: (file: File | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  hint?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageChange,
  disabled = false,
  label,
  placeholder,
  hint
}) => {
  const { t } = useTranslation();

  const handleImageChange = async (file: File | null) => {
    if (file && !disabled) {
      try {
        // Validate that it's actually an image file or SVG
        if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.svg')) {
          console.error('Selected file is not an image or SVG');
          return;
        }

        onImageChange(file);
      } catch (error) {
        console.error('Error processing image file:', error);
      }
    } else if (!file) {
      // Clear image data when no file is selected
      onImageChange(null);
    }
  };

  return (
    <Stack gap="sm">
      <PrivateContent>
        <FileInput
          label={label}
          placeholder={placeholder || t('sign.image.placeholder', 'Select image file')}
          accept="image/*,.svg"
          onChange={handleImageChange}
          disabled={disabled}
        />
      </PrivateContent>
      {hint && (
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
};