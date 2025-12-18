import { useMemo, useState, useEffect } from "react";
import { Stack, Text, Box, ActionIcon, Group, Center } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { RotateParametersHook } from "@app/hooks/tools/rotate/useRotateParameters";
import { useSelectedFiles } from "@app/contexts/file/fileHooks";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";

interface RotateSettingsProps {
  parameters: RotateParametersHook;
  disabled?: boolean;
}

const RotateSettings = ({ parameters, disabled = false }: RotateSettingsProps) => {
  const { t } = useTranslation();
  const { selectedFileStubs } = useSelectedFiles();

  // Get the first selected file for preview
  const selectedStub = useMemo(() => {
    return selectedFileStubs.length > 0 ? selectedFileStubs[0] : null;
  }, [selectedFileStubs]);

  // Get thumbnail for the selected file
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    setThumbnail(selectedStub?.thumbnailUrl || null);
  }, [selectedStub]);

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
              width: '280px',
              height: '280px',
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--mantine-color-gray-0)',
              overflow: 'hidden',
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
                justifyContent: 'center',
              }}
            >
              <DocumentThumbnail
                file={selectedStub}
                thumbnail={thumbnail}
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
          <LocalIcon icon="rotate-left-rounded" width="1.5rem" height="1.5rem" />
        </ActionIcon>

        <ActionIcon
          size="xl"
          variant="outline"
          onClick={parameters.rotateClockwise}
          disabled={disabled}
          aria-label={t("rotate.rotateRight", "Rotate Clockwise")}
          title={t("rotate.rotateRight", "Rotate Clockwise")}
        >
          <LocalIcon icon="rotate-right-rounded" width="1.5rem" height="1.5rem" />
        </ActionIcon>
      </Group>
    </Stack>
  );
};

export default RotateSettings;
