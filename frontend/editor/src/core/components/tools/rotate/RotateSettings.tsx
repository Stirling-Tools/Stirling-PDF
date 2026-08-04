import { useEffect } from "react";
import { Stack, Text, Box, ActionIcon, Group, Center } from "@mantine/core";
import { useTranslation } from "react-i18next";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import { RotateParametersHook } from "@app/hooks/tools/rotate/useRotateParameters";
import { useViewScopedFileStubs } from "@app/hooks/tools/shared/useViewScopedFiles";
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
  // Preview the document the rotation will actually apply to, so it follows
  // the viewer when the user switches files with the tool open.
  const [previewStub = null] = useViewScopedFileStubs();

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
              <DocumentThumbnail
                file={previewStub}
                thumbnail={previewStub?.thumbnailUrl ?? null}
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
          <RotateLeftIcon style={{ fontSize: "1.5rem" }} />
        </ActionIcon>

        <ActionIcon
          size="xl"
          variant="outline"
          onClick={parameters.rotateClockwise}
          disabled={disabled}
          aria-label={t("rotate.rotateRight", "Rotate Clockwise")}
          title={t("rotate.rotateRight", "Rotate Clockwise")}
        >
          <RotateRightIcon style={{ fontSize: "1.5rem" }} />
        </ActionIcon>
      </Group>
    </Stack>
  );
};

export default RotateSettings;
