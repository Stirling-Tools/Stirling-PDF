import { useCallback } from "react";
import { Modal, Stack, Text, Box, Alert } from "@mantine/core";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import { useMobileTransferSession } from "@app/hooks/useMobileTransferSession";

interface MobileSignatureModalProps {
  opened: boolean;
  onClose: () => void;
  /** Receives the signature as a PNG/image data URL. */
  onSignatureReceived: (dataUrl: string) => void;
}

/**
 * QR modal for drawing a signature on a phone or tablet. The phone opens the
 * public `/mobile-sign` page and uploads a PNG through the mobile transfer
 * session; the first image to arrive becomes the drawn signature and the
 * modal closes.
 */
export default function MobileSignatureModal({
  opened,
  onClose,
  onSignatureReceived,
}: MobileSignatureModalProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();

  const handleFileReceived = useCallback(
    (file: File) =>
      new Promise<void>((resolve) => {
        // The session endpoints accept any upload from anyone holding the QR
        // URL, so never assume the bytes are a signature: only images pass.
        if (!file.type.startsWith("image/")) {
          console.warn(
            "[MobileSignatureModal] Ignoring non-image upload:",
            file.type,
          );
          resolve();
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result;
          if (typeof dataUrl === "string") {
            onSignatureReceived(dataUrl);
            onClose();
          }
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(file);
      }),
    [onSignatureReceived, onClose],
  );

  const { mobileUrl, error, timeRemaining, showExpiryWarning } =
    useMobileTransferSession({
      active: opened,
      routePath: "mobile-sign",
      onFileReceived: handleFileReceived,
      sessionCreateErrorMessage: t(
        "sign.mobile.sessionCreateError",
        "Failed to create session",
      ),
      pollingErrorMessage: t(
        "sign.mobile.pollingError",
        "Error checking for the signature",
      ),
      configuredUrl:
        localStorage.getItem("server_url") || config?.frontendUrl || "",
    });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("sign.mobile.title", "Draw on your phone")}
      centered
      size="md"
      radius="lg"
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      overlayProps={{ opacity: 0.35, blur: 2 }}
      styles={{ body: { paddingTop: "1.5rem" } }}
    >
      <Stack gap="md">
        <Alert
          icon={<InfoRoundedIcon style={{ fontSize: "1rem" }} />}
          color="blue"
          variant="light"
        >
          <Text size="sm">
            {t(
              "sign.mobile.description",
              "Scan this QR code with your phone or tablet, draw your signature, and it will appear here automatically.",
            )}
          </Text>
        </Alert>

        {showExpiryWarning && timeRemaining !== null && (
          <Alert
            icon={<WarningRoundedIcon style={{ fontSize: "1rem" }} />}
            title={t("sign.mobile.expiryWarning", "QR Code Expiring Soon")}
            color="orange"
          >
            <Text size="sm">
              {t(
                "sign.mobile.expiryWarningMessage",
                "This QR code will expire in {{seconds}} seconds. A new code will be generated automatically.",
                { seconds: Math.ceil(timeRemaining / 1000) },
              )}
            </Text>
          </Alert>
        )}

        {error && (
          <Alert
            icon={<ErrorRoundedIcon style={{ fontSize: "1rem" }} />}
            title={t("sign.mobile.error", "Connection Error")}
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
            <QRCodeSVG value={mobileUrl} size={220} level="H" includeMargin />
          </Box>

          <Text size="xs" c="dimmed" ta="center" style={{ maxWidth: "300px" }}>
            {t(
              "sign.mobile.instructions",
              "Open the camera app on your phone and scan this code. Keep this window open while you draw.",
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
