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
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageChange,
  disabled = false,
  label,
  placeholder,
  hint,
  allowBackgroundRemoval = false,
  onProcessedImageData
}) => {
  const { t } = useTranslation();
  const [removeBackground, setRemoveBackground] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [originalImageData, setOriginalImageData] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processImage = async (imageSource: File | string, shouldRemoveBackground: boolean): Promise<void> => {
    if (shouldRemoveBackground && allowBackgroundRemoval) {
      setIsProcessing(true);
      try {
        const transparentImageDataUrl = await removeWhiteBackground(imageSource, {
          autoDetectCorner: true,
          tolerance: 15
        });
        onProcessedImageData?.(transparentImageDataUrl);
      } catch (error) {
        console.error('Error removing background:', error);
        onProcessedImageData?.(null);
      } finally {
        setIsProcessing(false);
      }
    } else {
      // When background removal is disabled, return the original image data
      if (typeof imageSource === 'string') {
        onProcessedImageData?.(imageSource);
      } else {
        // Convert File to data URL if needed
        const reader = new FileReader();
        reader.onload = (e) => {
          onProcessedImageData?.(e.target?.result as string);
        };
        reader.readAsDataURL(imageSource);
      }
    }
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

        const originalDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        setOriginalImageData(originalDataUrl);
        await processImage(file, removeBackground);
      } catch (error) {
        console.error('Error processing image file:', error);
      }
    } else if (!file) {
      // Clear image data when no file is selected
      setCurrentFile(null);
      setOriginalImageData(null);
      onImageChange(null);
      onProcessedImageData?.(null);
    }
  };

  const handleBackgroundRemovalChange = async (checked: boolean) => {
    if (isProcessing) return; // Prevent race conditions
    setRemoveBackground(checked);
    if (originalImageData) {
      await processImage(originalImageData, checked);
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
