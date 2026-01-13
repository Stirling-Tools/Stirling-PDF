import React, { useState } from 'react';
import { FileInput, Text, Stack, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PrivateContent } from '@app/components/shared/PrivateContent';
import { removeWhiteBackground } from '@app/utils/imageTransparency';
import { alert } from '@app/components/toast';

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
        alert({
          title: t('sign.image.backgroundRemovalFailedTitle', 'Background removal failed'),
          body: t('sign.image.backgroundRemovalFailedMessage', 'Could not remove the background from the image. Using original image instead.'),
          alertType: 'error'
        });
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
        // Validate that it's actually an image file or SVG
        if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.svg')) {
          console.error('Selected file is not an image or SVG');
          return;
        }

        setCurrentFile(file);
        onImageChange(file);

        let dataUrlToProcess: string;
        
        // Check if file is SVG
        const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        
        if (isSvg) {
          // For SVG, convert to PNG so it can be embedded in PDF
          dataUrlToProcess = await convertSvgToPng(file);
        } else {
          // For other images, read as data URL directly
          dataUrlToProcess = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
        }

        setOriginalImageData(dataUrlToProcess);
        await processImage(dataUrlToProcess, removeBackground);
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

  // Helper function to convert SVG to PNG
  const convertSvgToPng = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const svgText = e.target?.result as string;
          
          // Create an image element to render SVG
          const img = new Image();
          const blob = new Blob([svgText], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          
          img.onload = () => {
            // Create canvas to convert to PNG
            const canvas = document.createElement('canvas');
            canvas.width = img.width || 800;  // Default to 800px if width not specified
            canvas.height = img.height || 600; // Default to 600px if height not specified
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              URL.revokeObjectURL(url);
              reject(new Error('Failed to get canvas context'));
              return;
            }
            
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            
            // Convert canvas to PNG data URL
            const pngDataUrl = canvas.toDataURL('image/png');
            resolve(pngDataUrl);
          };
          
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load SVG image'));
          };
          
          img.src = url;
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
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
          accept="image/*,.svg"
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
