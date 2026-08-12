import { useCallback } from "react";
import { Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import MobileTransferModal from "@app/components/shared/MobileTransferModal";
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
  const convertToPdf = config?.mobileScannerConvertToPdf !== false;

  const handleFileReceived = useCallback(
    async (received: File) => {
      let file = received;

      // Convert images to PDF if enabled
      if (isImageFile(file) && convertToPdf) {
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
    [config, convertToPdf, onFilesReceived],
  );

  return (
    <MobileTransferModal
      opened={opened}
      onClose={onClose}
      routePath="mobile-scanner"
      onFileReceived={handleFileReceived}
      qrSize={256}
      title={t("mobileUpload.title", "Upload from Mobile")}
      description={
        convertToPdf
          ? t(
              "mobileUpload.description",
              "Scan this QR code with your mobile device to upload photos. Images will be automatically converted to PDF.",
            )
          : t(
              "mobileUpload.descriptionNoConvert",
              "Scan this QR code with your mobile device to upload photos.",
            )
      }
      instructions={
        convertToPdf
          ? t(
              "mobileUpload.instructions",
              "Open the camera app on your phone and scan this code. Images will be automatically converted to PDF.",
            )
          : t(
              "mobileUpload.instructionsNoConvert",
              "Open the camera app on your phone and scan this code. Files will be uploaded through the server.",
            )
      }
      expiryWarningTitle={t(
        "mobileUpload.expiryWarning",
        "Session Expiring Soon",
      )}
      formatExpiryWarning={(seconds) =>
        t(
          "mobileUpload.expiryWarningMessage",
          "This QR code will expire in {{seconds}} seconds. A new code will be generated automatically.",
          { seconds },
        )
      }
      errorTitle={t("mobileUpload.error", "Connection Error")}
      sessionCreateErrorMessage={t(
        "mobileUpload.sessionCreateError",
        "Failed to create session",
      )}
      pollingErrorMessage={t(
        "mobileUpload.pollingError",
        "Error checking for files",
      )}
      renderReceived={(count) => (
        <Badge
          variant="filled"
          color="green"
          size="lg"
          leftSection={<CheckRoundedIcon style={{ fontSize: "1rem" }} />}
        >
          {t("mobileUpload.filesReceived", "{{count}} file(s) received", {
            count,
          })}
        </Badge>
      )}
    />
  );
}
