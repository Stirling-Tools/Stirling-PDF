import React from 'react';
import { FileInput, Text, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';

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
        // Validate that it's actually an image file
        if (!file.type.startsWith('image/')) {
          console.error('Selected file is not an image');
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
      <FileInput
        label={label || t('sign.image.label', 'Upload signature image')}
        placeholder={placeholder || t('sign.image.placeholder', 'Select image file')}
        accept="image/*"
        onChange={handleImageChange}
        disabled={disabled}
      />
      <Text size="sm" c="dimmed">
        {hint || t('sign.image.hint', 'Upload a PNG or JPG image of your signature')}
      </Text>
    </Stack>
  );
};