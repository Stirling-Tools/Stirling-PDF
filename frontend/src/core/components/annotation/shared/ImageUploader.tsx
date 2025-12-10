import React, { useState } from 'react';
import { FileInput, Text, Stack, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PrivateContent } from '@app/components/shared/PrivateContent';
import { removeWhiteBackground } from '@app/utils/imageTransparency';

interface ImageUploaderProps {
  onImageChange: (file: File | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  hint?: string;
  allowBackgroundRemoval?: boolean;
  onProcessedImageData?: (dataUrl: string | null) => void;
  currentImageData?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageChange,
  disabled = false,
  label,
  placeholder,
  hint,
  allowBackgroundRemoval = false,
  onProcessedImageData,
  currentImageData
}) => {
  const { t } = useTranslation();
  const [removeBackground, setRemoveBackground] = useState(true);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processImage = async (imageSource: File | string, shouldRemoveBackground: boolean) => {
    if (shouldRemoveBackground && allowBackgroundRemoval) {
      setIsProcessing(true);
      try {
        const transparentImageDataUrl = await removeWhiteBackground(imageSource, {
          autoDetectCorner: true,
          tolerance: 15
        });
        onProcessedImageData?.(transparentImageDataUrl);
        return transparentImageDataUrl;
      } catch (error) {
        console.error('Error removing background:', error);
        onProcessedImageData?.(null);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setIsProcessing(false);
    }
    return null;
  };

  const handleImageChange = async (file: File | null) => {
    if (file && !disabled) {
      try {
        // Validate that it's actually an image file
        if (!file.type.startsWith('image/')) {
          console.error('Selected file is not an image');
          return;
        }

        setCurrentFile(file);
        onImageChange(file);
        await processImage(file, removeBackground);
      } catch (error) {
        console.error('Error processing image file:', error);
      }
    } else if (!file) {
      // Clear image data when no file is selected
      setCurrentFile(null);
      onImageChange(null);
      onProcessedImageData?.(null);
    }
  };

  const handleBackgroundRemovalChange = async (checked: boolean) => {
    setRemoveBackground(checked);
    if (currentImageData) {
      await processImage(currentImageData, checked);
    } else if (currentFile) {
      await processImage(currentFile, checked);
    }
  };

  return (
    <Stack gap="sm">
      <PrivateContent>
        <FileInput
          label={label}
          placeholder={placeholder || t('sign.image.placeholder', 'Select image file')}
          accept="image/*"
          onChange={handleImageChange}
          disabled={disabled || isProcessing}
        />
      </PrivateContent>
      {allowBackgroundRemoval && (
        <Checkbox
          label={t('sign.image.removeBackground', 'Remove white background (make transparent)')}
          checked={removeBackground}
          onChange={(event) => handleBackgroundRemovalChange(event.currentTarget.checked)}
          disabled={disabled || !currentFile || isProcessing}
        />
      )}
      {hint && (
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      )}
      {isProcessing && (
        <Text size="sm" c="dimmed">
          {t('sign.image.processing', 'Processing image...')}
        </Text>
      )}
    </Stack>
  );
};
