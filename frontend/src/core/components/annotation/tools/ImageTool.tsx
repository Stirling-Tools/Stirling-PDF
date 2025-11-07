import React from 'react';
import { Stack } from '@mantine/core';
import { BaseAnnotationTool } from '@app/components/annotation/shared/BaseAnnotationTool';
import { ImageUploader } from '@app/components/annotation/shared/ImageUploader';

interface ImageToolProps {
  onImageChange?: (data: string | null) => void;
  disabled?: boolean;
}

export const ImageTool: React.FC<ImageToolProps> = ({
  onImageChange,
  disabled = false
}) => {
  const readFileAsDataUrl = async (file: File | null): Promise<string | null> => {
    if (!file || disabled) {
      return null;
    }

    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(e.target.result as string);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  };

  const toolConfig = {
    enableImageUpload: true,
    showPlaceButton: true,
    placeButtonText: "Place Image"
  };

  return (
    <BaseAnnotationTool
      config={toolConfig}
      onSignatureDataChange={onImageChange}
      disabled={disabled}
    >
      {({ onSignatureDataChange }) => (
        <Stack gap="sm">
          <ImageUploader
            onImageChange={async (file) => {
              const data = await readFileAsDataUrl(file);
              onSignatureDataChange(data);
              onImageChange?.(data);
            }}
            disabled={disabled}
            label="Upload Image"
            placeholder="Select image file"
            hint="Upload a PNG, JPG, or other image file to place on the PDF"
          />
        </Stack>
      )}
    </BaseAnnotationTool>
  );
};
