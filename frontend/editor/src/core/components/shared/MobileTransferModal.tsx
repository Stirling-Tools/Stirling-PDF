import { ReactNode } from "react";
import { Modal, Stack, Text, Box, Alert } from "@mantine/core";
import { QRCodeSVG } from "qrcode.react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import { useMobileTransferSession } from "@app/hooks/useMobileTransferSession";

/**
 * The QR modal shell every phone-to-desktop transfer feature shares: session
 * lifecycle, QR code, expiry/error alerts, and the fallback URL line. A
 * feature supplies its copy, its public route, and what a received file
 * means — the scanner converts to PDF, the sign tool routes it to a
 * signature source.
 */
interface MobileTransferModalProps {
  opened: boolean;
  onClose: () => void;
  /** SPA route the phone opens, without slashes: "mobile-scanner", "mobile-sign". */
  routePath: string;
  /** Called once per uploaded file; arrivals are untrusted, validate inside. */
  onFileReceived: (file: File) => void | Promise<void>;
  title: string;
  description: string;
  instructions: string;
  expiryWarningTitle: string;
  /** Interpolates the seconds remaining into the feature's warning copy. */
  formatExpiryWarning: (seconds: number) => string;
  errorTitle: string;
  sessionCreateErrorMessage: string;
  pollingErrorMessage: string;
  /** Rendered under the QR once files have arrived (e.g. a received-count badge). */
  renderReceived?: (count: number) => ReactNode;
  qrSize?: number;
}

export default function MobileTransferModal({
  opened,
  onClose,
  routePath,
  onFileReceived,
  title,
  description,
  instructions,
  expiryWarningTitle,
  formatExpiryWarning,
  errorTitle,
  sessionCreateErrorMessage,
  pollingErrorMessage,
  renderReceived,
  qrSize = 240,
}: MobileTransferModalProps) {
  const { config } = useAppConfig();

  const { mobileUrl, filesReceived, error, timeRemaining, showExpiryWarning } =
    useMobileTransferSession({
      active: opened,
      routePath,
      onFileReceived,
      sessionCreateErrorMessage,
      pollingErrorMessage,
      // In dev the backend-advertised frontendUrl is the backend origin, which
      // serves no SPA — the phone must open the Vite origin this page runs on,
      // so let the URL builder fall back to it. An explicit server_url still
      // wins, as an escape hatch.
      configuredUrl:
        localStorage.getItem("server_url") ||
        (import.meta.env.DEV ? "" : config?.frontendUrl || ""),
    });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
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
          <Text size="sm">{description}</Text>
        </Alert>

        {showExpiryWarning && timeRemaining !== null && (
          <Alert
            icon={<WarningRoundedIcon style={{ fontSize: "1rem" }} />}
            title={expiryWarningTitle}
            color="orange"
          >
            <Text size="sm">
              {formatExpiryWarning(Math.ceil(timeRemaining / 1000))}
            </Text>
          </Alert>
        )}

        {error && (
          <Alert
            icon={<ErrorRoundedIcon style={{ fontSize: "1rem" }} />}
            title={errorTitle}
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
            <QRCodeSVG
              value={mobileUrl}
              size={qrSize}
              level="H"
              includeMargin
            />
          </Box>

          {filesReceived > 0 && renderReceived?.(filesReceived)}

          <Text size="xs" c="dimmed" ta="center" style={{ maxWidth: "300px" }}>
            {instructions}
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
