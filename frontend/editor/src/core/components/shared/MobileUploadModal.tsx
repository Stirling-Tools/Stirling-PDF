import { useCallback } from "react";
import { Modal, Stack, Text, Badge, Box, Alert } from "@mantine/core";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import { useMobileTransferSession } from "@app/hooks/useMobileTransferSession";
import { convertImageToPdf, isImageFile } from "@app/utils/imageToPdfUtils";

interface MobileUploadModalProps {
  opened: boolean;
  onClose: () => void;
  onFilesReceived: (files: File[]) => void;
}

/**
 * MobileUploadModal
 *
 * Displays a QR code that mobile devices can scan to upload files via backend server.
 * Files are temporarily stored on server and retrieved by desktop.
 */
export default function MobileUploadModal({
  opened,
  onClose,
  onFilesReceived,
}: MobileUploadModalProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();

  const handleFileReceived = useCallback(
    async (received: File) => {
      let file = received;

      // Convert images to PDF if enabled
      if (isImageFile(file) && config?.mobileScannerConvertToPdf !== false) {
        try {
          file = await convertImageToPdf(file, {
            imageResolution: config?.mobileScannerImageResolution as
              | "full"
              | "reduced"
              | undefined,
            pageFormat: config?.mobileScannerPageFormat as
              | "keep"
              | "A4"
              | "letter"
              | undefined,
            stretchToFit: config?.mobileScannerStretchToFit,
          });
        } catch (convertError) {
          console.warn(
            "[MobileUploadModal] Failed to convert image to PDF, using original file:",
            convertError,
          );
          // Continue with original image file if conversion fails
        }
      }

      onFilesReceived([file]);
    },
    [config, onFilesReceived],
  );

  const { mobileUrl, filesReceived, error, timeRemaining, showExpiryWarning } =
    useMobileTransferSession({
      active: opened,
      routePath: "mobile-scanner",
      onFileReceived: handleFileReceived,
      sessionCreateErrorMessage: t(
        "mobileUpload.sessionCreateError",
        "Failed to create session",
      ),
      pollingErrorMessage: t(
        "mobileUpload.pollingError",
        "Error checking for files",
      ),
      configuredUrl:
        localStorage.getItem("server_url") || config?.frontendUrl || "",
    });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("mobileUpload.title", "Upload from Mobile")}
      centered
      size="md"
      radius="lg"
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      overlayProps={{ opacity: 0.35, blur: 2 }}
      styles={{
        body: {
          paddingTop: "1.5rem",
        },
      }}
    >
      <Stack gap="md">
        <Alert
          icon={<InfoRoundedIcon style={{ fontSize: "1rem" }} />}
          color="blue"
          variant="light"
        >
          <Text size="sm">
            {config?.mobileScannerConvertToPdf !== false
              ? t(
                  "mobileUpload.description",
                  "Scan this QR code with your mobile device to upload photos. Images will be automatically converted to PDF.",
                )
              : t(
                  "mobileUpload.descriptionNoConvert",
                  "Scan this QR code with your mobile device to upload photos.",
                )}
          </Text>
        </Alert>

        {showExpiryWarning && timeRemaining !== null && (
          <Alert
            icon={<WarningRoundedIcon style={{ fontSize: "1rem" }} />}
            title={t("mobileUpload.expiryWarning", "Session Expiring Soon")}
            color="orange"
          >
            <Text size="sm">
              {t(
                "mobileUpload.expiryWarningMessage",
                "This QR code will expire in {{seconds}} seconds. A new code will be generated automatically.",
                { seconds: Math.ceil(timeRemaining / 1000) },
              )}
            </Text>
          </Alert>
        )}

        {error && (
          <Alert
            icon={<ErrorRoundedIcon style={{ fontSize: "1rem" }} />}
            title={t("mobileUpload.error", "Connection Error")}
            color="red"
          >
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        <Box
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <Box
            style={{
              padding: "1.5rem",
              background: "white",
              borderRadius: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            <QRCodeSVG value={mobileUrl} size={256} level="H" includeMargin />
          </Box>

          {filesReceived > 0 && (
            <Badge
              variant="filled"
              color="green"
              size="lg"
              leftSection={<CheckRoundedIcon style={{ fontSize: "1rem" }} />}
            >
              {t("mobileUpload.filesReceived", "{{count}} file(s) received", {
                count: filesReceived,
              })}
            </Badge>
          )}

          <Text size="xs" c="dimmed" ta="center" style={{ maxWidth: "300px" }}>
            {config?.mobileScannerConvertToPdf !== false
              ? t(
                  "mobileUpload.instructions",
                  "Open the camera app on your phone and scan this code. Images will be automatically converted to PDF.",
                )
              : t(
                  "mobileUpload.instructionsNoConvert",
                  "Open the camera app on your phone and scan this code. Files will be uploaded through the server.",
                )}
          </Text>

          <Text
            size="xs"
            c="dimmed"
            style={{
              wordBreak: "break-all",
              textAlign: "center",
              fontFamily: "monospace",
            }}
          >
            {mobileUrl}
          </Text>
        </Box>
      </Stack>
    </Modal>
  );
}
