import React, { useState, useCallback, useEffect } from "react";
import { Modal, Button, Stack, Slider, Alert, Text, Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import Cropper from "react-easy-crop";
import { getCroppedImage, type Area } from "@app/utils/cropImage";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

interface ProfilePictureCropperProps {
  file: File | null;
  opened: boolean;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob) => void;
}

export const ProfilePictureCropper: React.FC<ProfilePictureCropperProps> = ({
  file,
  opened,
  onClose,
  onCropComplete,
}) => {
  const { t } = useTranslation();

  // State management
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load image when file changes
  useEffect(() => {
    if (!file) {
      setImageSrc(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setError(null);
    };
    reader.onerror = () => {
      setError(
        t(
          "config.account.profilePicture.cropper.invalidImage",
          "Invalid image file. Please select a valid PNG, JPG, or WebP file.",
        ),
      );
    };
    reader.readAsDataURL(file);

    // Cleanup
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [file, t]);

  // Reset state when modal closes
  useEffect(() => {
    if (!opened) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setProcessing(false);
      setError(null);
    }
  }, [opened]);

  // Called when crop area changes
  const onCropChange = useCallback((newCrop: { x: number; y: number }) => {
    setCrop(newCrop);
  }, []);

  // Called when zoom changes
  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  // Called when crop is complete (stores the crop area in pixels)
  const onCropCompleteCallback = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  // Process and save the cropped image
  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Crop the image
      const croppedBlob = await getCroppedImage(imageSrc, croppedAreaPixels);

      // Validate size (2MB limit)
      const maxSize = 2 * 1024 * 1024; // 2MB in bytes
      if (croppedBlob.size > maxSize) {
        setError(
          t(
            "config.account.profilePicture.cropper.sizeErrorAfterCrop",
            "Cropped image is too large. Please zoom out or crop a smaller area.",
          ),
        );
        setProcessing(false);
        return;
      }

      // Call parent callback with cropped blob
      onCropComplete(croppedBlob);
      onClose();
    } catch (err) {
      console.error("Error cropping image:", err);
      setError(
        t(
          "config.account.profilePicture.cropper.cropError",
          "Failed to crop image. Please try again.",
        ),
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t(
        "config.account.profilePicture.cropper.title",
        "Crop Profile Picture",
      )}
      size="lg"
      centered
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        {/* Cropper area */}
        <Box style={{ position: "relative", width: "100%", height: 400 }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropCompleteCallback}
            />
          )}
        </Box>

        {/* Zoom slider */}
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            {t("config.account.profilePicture.cropper.zoom", "Zoom")}
          </Text>
          <Slider
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            onChange={setZoom}
            disabled={processing}
          />
        </Stack>

        {/* Action buttons */}
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}
        >
          <Button variant="subtle" onClick={onClose} disabled={processing}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} loading={processing}>
            {processing
              ? t(
                  "config.account.profilePicture.cropper.processing",
                  "Processing crop...",
                )
              : t(
                  "config.account.profilePicture.cropper.save",
                  "Save Cropped Image",
                )}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
};
