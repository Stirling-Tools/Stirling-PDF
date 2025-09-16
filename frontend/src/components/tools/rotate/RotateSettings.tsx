import React, { useMemo, useState, useEffect } from "react";
import { Stack, Text, Box, ActionIcon, Group, Center } from "@mantine/core";
import { useTranslation } from "react-i18next";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import { RotateParametersHook } from "../../../hooks/tools/rotate/useRotateParameters";
import { useSelectedFiles } from "../../../contexts/file/fileHooks";
import { useThumbnailGeneration } from "../../../hooks/useThumbnailGeneration";
import DocumentThumbnail from "../../shared/filePreview/DocumentThumbnail";

interface RotateSettingsProps {
  parameters: RotateParametersHook;
  disabled?: boolean;
}

const RotateSettings = ({ parameters, disabled = false }: RotateSettingsProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useSelectedFiles();
  const { getThumbnailFromCache, requestThumbnail } = useThumbnailGeneration();

  // Get the first selected file for preview
  const selectedFile = useMemo(() => {
    return selectedFiles.length > 0 ? selectedFiles[0] : null;
  }, [selectedFiles]);

  // Get thumbnail for the selected file
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setThumbnail(null);
      return;
    }

    const pageId = `${selectedFile.fileId}-1`;

    // Try to get cached thumbnail first
    const cached = getThumbnailFromCache(pageId);
    if (cached) {
      setThumbnail(cached);
      return;
    }

    // Request thumbnail if not cached
    requestThumbnail(pageId, selectedFile, 1).then((result) => {
      setThumbnail(result);
    }).catch(() => {
      setThumbnail(null);
    });
  }, [selectedFile, getThumbnailFromCache, requestThumbnail]);

  // Calculate current angle display
  const currentAngle = parameters.parameters.angle;

  return (
    <Stack gap="md">
      {/* Thumbnail Preview Section */}
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t("rotate.preview.title", "Rotation Preview")}
        </Text>

        <Center>
          <Box
            style={{
              width: '200px',
              height: '280px',
              border: '2px dashed var(--mantine-color-gray-4)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--mantine-color-gray-0)',
              overflow: 'hidden'
            }}
          >
            <Box
              style={{
                width: '100%',
                height: '100%',
                transform: `rotate(${currentAngle}deg)`,
                transition: 'transform 0.3s ease-in-out',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <DocumentThumbnail
                file={selectedFile}
                thumbnail={thumbnail}
                style={{
                  maxWidth: '180px',
                  maxHeight: '260px'
                }}
              />
            </Box>
          </Box>
        </Center>
      </Stack>

      {/* Rotation Controls */}
      <Group justify="center" gap="lg">
        <ActionIcon
          size="xl"
          variant="outline"
          onClick={parameters.rotateAnticlockwise}
          disabled={disabled}
          aria-label={t("rotate.rotateLeft", "Rotate Anticlockwise")}
          title={t("rotate.rotateLeft", "Rotate Anticlockwise")}
        >
          <RotateLeftIcon style={{ fontSize: '1.5rem' }} />
        </ActionIcon>

        <ActionIcon
          size="xl"
          variant="outline"
          onClick={parameters.rotateClockwise}
          disabled={disabled}
          aria-label={t("rotate.rotateRight", "Rotate Clockwise")}
          title={t("rotate.rotateRight", "Rotate Clockwise")}
        >
          <RotateRightIcon style={{ fontSize: '1.5rem' }} />
        </ActionIcon>
      </Group>
    </Stack>
  );
};

export default RotateSettings;
