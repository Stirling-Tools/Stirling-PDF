import React, { useState } from "react";
import { Stack, Text, Group } from "@mantine/core";
import { Button } from "@app/ui/Button";
import HistoryIcon from "@mui/icons-material/History";
import PhonelinkIcon from "@mui/icons-material/Phonelink";
import { useTranslation } from "react-i18next";
import { useFileManagerContext } from "@app/contexts/FileManagerContext";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useIsMobile } from "@app/hooks/useIsMobile";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";
import { GoogleDriveIcon } from "@app/components/shared/CloudStorageIcons";
interface FileSourceButtonsProps {
  horizontal?: boolean;
}
const FileSourceButtons: React.FC<FileSourceButtonsProps> = ({
  horizontal = false,
}) => {
  const {
    activeSource,
    onSourceChange,
    onLocalFileClick,
    onGoogleDriveSelect,
    onNewFilesSelect,
  } = useFileManagerContext();
  const { t } = useTranslation();
  const { isEnabled: isGoogleDriveEnabled, openPicker: openGoogleDrivePicker } =
    useGoogleDrivePicker();
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const UploadIcon = icons.upload;
  const [mobileUploadModalOpen, setMobileUploadModalOpen] = useState(false);
  const { config } = useAppConfig();
  const isMobile = useIsMobile();
  const isMobileUploadEnabled = config?.enableMobileScanner && !isMobile;
  const handleGoogleDriveClick = async () => {
    try {
      const files = await openGoogleDrivePicker({ multiple: true });
      if (files.length > 0) {
        onGoogleDriveSelect(files);
      }
    } catch (error) {
      console.error("Failed to pick files from Google Drive:", error);
    }
  };
  const handleMobileUploadClick = () => {
    setMobileUploadModalOpen(true);
  };
  const handleFilesReceivedFromMobile = (files: File[]) => {
    if (files.length > 0) {
      onNewFilesSelect(files);
    }
  };
  // Determine visibility of Google Drive button
  const shouldHideGoogleDrive =
    !isGoogleDriveEnabled && config?.hideDisabledToolsGoogleDrive;
  // Determine visibility of Mobile QR Scanner button
  const shouldHideMobileQR =
    !isMobileUploadEnabled && config?.hideDisabledToolsMobileQRScanner;
  // Shared Button has no `xs`; map the old horizontal `xs` to `sm`.
  const buttonSize = "sm" as const;
  const buttonJustify = horizontal ? "center" : "start";
  const buttons = (
    <>
      <Button
        variant={activeSource === "recent" ? "primary" : "tertiary"}
        accent="neutral"
        leftSection={<HistoryIcon />}
        justify={buttonJustify}
        onClick={() => onSourceChange("recent")}
        fullWidth={!horizontal}
        size={buttonSize}
      >
        {t("fileManager.recent", "Recent")}
      </Button>
      <Button
        variant="tertiary"
        accent="neutral"
        leftSection={<UploadIcon />}
        justify={buttonJustify}
        onClick={onLocalFileClick}
        fullWidth={!horizontal}
        size={buttonSize}
      >
        {horizontal ? terminology.upload : terminology.uploadFiles}
      </Button>
      {!shouldHideGoogleDrive && (
        <Button
          variant="tertiary"
          accent="neutral"
          leftSection={<GoogleDriveIcon colored={isGoogleDriveEnabled} />}
          justify={buttonJustify}
          onClick={handleGoogleDriveClick}
          fullWidth={!horizontal}
          size={buttonSize}
          disabled={!isGoogleDriveEnabled}
          title={
            !isGoogleDriveEnabled
              ? t(
                  "fileManager.googleDriveNotAvailable",
                  "Google Drive integration not available",
                )
              : undefined
          }
        >
          {horizontal
            ? t("fileManager.googleDriveShort", "Drive")
            : t("fileManager.googleDrive", "Google Drive")}
        </Button>
      )}
      {!shouldHideMobileQR && (
        <Button
          variant="tertiary"
          accent="neutral"
          leftSection={<PhonelinkIcon />}
          justify={buttonJustify}
          onClick={handleMobileUploadClick}
          fullWidth={!horizontal}
          size={buttonSize}
          disabled={!isMobileUploadEnabled}
          title={
            !isMobileUploadEnabled
              ? t(
                  "fileManager.mobileUploadNotAvailable",
                  "Mobile upload not available",
                )
              : undefined
          }
        >
          {horizontal
            ? t("fileManager.mobileShort", "Mobile")
            : t("fileManager.mobileUpload", "Mobile Upload")}
        </Button>
      )}
    </>
  );
  if (horizontal) {
    return (
      <>
        <Group gap="xs" justify="center" style={{ width: "100%" }}>
          {buttons}
        </Group>
        <MobileUploadModal
          opened={mobileUploadModalOpen}
          onClose={() => setMobileUploadModalOpen(false)}
          onFilesReceived={handleFilesReceivedFromMobile}
        />
      </>
    );
  }
  return (
    <>
      <Stack gap="xs" style={{ height: "100%" }}>
        <Text
          size="sm"
          pt="sm"
          fw={500}
          c="dimmed"
          mb="xs"
          style={{ paddingLeft: "1rem" }}
        >
          {t("fileManager.myFiles", "My Files")}
        </Text>
        {buttons}
      </Stack>
      <MobileUploadModal
        opened={mobileUploadModalOpen}
        onClose={() => setMobileUploadModalOpen(false)}
        onFilesReceived={handleFilesReceivedFromMobile}
      />
    </>
  );
};
export default FileSourceButtons;
