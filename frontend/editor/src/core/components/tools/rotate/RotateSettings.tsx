import { useMemo, useState, useEffect } from "react";
import { Stack, Text, Box, Group, Center } from "@mantine/core";
import { Button } from "@shared/components/Button";
import { useTranslation } from "react-i18next";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import { RotateParametersHook } from "@app/hooks/tools/rotate/useRotateParameters";
import { useAllFiles } from "@app/contexts/FileContext";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";

interface RotateSettingsProps {
  parameters: RotateParametersHook;
  disabled?: boolean;
}

const RotateSettings = ({
  parameters,
  disabled = false,
}: RotateSettingsProps) => {
  const { t } = useTranslation();
  const { fileStubs } = useAllFiles();

  // Get the first file for preview
  const selectedStub = useMemo(() => {
    return fileStubs.length > 0 ? fileStubs[0] : null;
  }, [fileStubs]);

  // Get thumbnail for the selected file
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    setThumbnail(selectedStub?.thumbnailUrl || null);
  }, [selectedStub]);

  // Calculate current angle display
  const currentAngle = parameters.parameters.angle;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        parameters.rotateAnticlockwise();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        parameters.rotateClockwise();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [parameters]);

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
              width: "280px",
              height: "280px",
              border: "1px solid var(--mantine-color-gray-3)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "var(--mantine-color-gray-0)",
              overflow: "hidden",
            }}
          >
            <Box
              style={{
                width: "100%",
                height: "100%",
                transform: `rotate(${currentAngle}deg)`,
                transition: "transform 0.3s ease-in-out",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DocumentThumbnail file={selectedStub} thumbnail={thumbnail} />
            </Box>
          </Box>
        </Center>
      </Stack>

      {/* Rotation Controls */}
      <Group justify="center" gap="lg">
        <Button
          size="lg"
          variant="secondary"
          onClick={parameters.rotateAnticlockwise}
          disabled={disabled}
          aria-label={t("rotate.rotateLeft", "Rotate Anticlockwise")}
          title={t("rotate.rotateLeft", "Rotate Anticlockwise")}
          leftSection={<RotateLeftIcon style={{ fontSize: "1.5rem" }} />}
        />

        <Button
          size="lg"
          variant="secondary"
          onClick={parameters.rotateClockwise}
          disabled={disabled}
          aria-label={t("rotate.rotateRight", "Rotate Clockwise")}
          title={t("rotate.rotateRight", "Rotate Clockwise")}
          leftSection={<RotateRightIcon style={{ fontSize: "1.5rem" }} />}
        />
      </Group>
    </Stack>
  );
};

export default RotateSettings;
