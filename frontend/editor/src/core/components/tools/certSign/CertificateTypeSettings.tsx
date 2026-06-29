import { useEffect } from "react";
import { Stack, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import { useAppConfig } from "@app/contexts/AppConfigContext";

interface CertificateTypeSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const sourceButtonStyle = {
  flex: 1,
  height: "auto",
  minHeight: "44px",
  fontSize: "11px",
} as const;

// Let labels wrap instead of clipping ("This device" was truncating to "This devi").
const sourceButtonStyles = {
  label: { whiteSpace: "normal" as const, lineHeight: 1.15 },
} as const;

const CertificateTypeSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: CertificateTypeSettingsProps) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const isServerCertificateEnabled = config?.serverCertificateEnabled ?? false;
  // Hardware-backed signing only works when the backend runs locally (desktop app).
  const isHardwareAvailable = config?.hardwareSigningAvailable ?? false;

  // Fall back to upload if a previously chosen source is no longer available
  // (e.g. an automation saved with DEVICE running on a server). Runs as an effect so we don't
  // call the parent's setter while rendering.
  useEffect(() => {
    if (parameters.signMode === "AUTO" && !isServerCertificateEnabled) {
      onParameterChange("signMode", "MANUAL");
    } else if (parameters.signMode === "DEVICE" && !isHardwareAvailable) {
      onParameterChange("signMode", "MANUAL");
    }
  }, [
    parameters.signMode,
    isServerCertificateEnabled,
    isHardwareAvailable,
    onParameterChange,
  ]);

  const selectUpload = () => {
    onParameterChange("signMode", "MANUAL");
    if (parameters.signMode !== "MANUAL") {
      onParameterChange("certType", "");
    }
  };

  const selectServer = () => {
    onParameterChange("signMode", "AUTO");
    onParameterChange("certType", "");
  };

  const selectDevice = () => {
    onParameterChange("signMode", "DEVICE");
    // Default to the Windows store; the device step lets the user switch to a token.
    if (
      parameters.certType !== "WINDOWS_STORE" &&
      parameters.certType !== "PKCS11"
    ) {
      onParameterChange("certType", "WINDOWS_STORE");
    }
    onParameterChange("alias", undefined);
  };

  return (
    <Stack gap="md">
      <div style={{ display: "flex", gap: "4px" }}>
        <Button
          variant={parameters.signMode === "MANUAL" ? "filled" : "outline"}
          color={
            parameters.signMode === "MANUAL" ? "blue" : "var(--text-muted)"
          }
          onClick={selectUpload}
          disabled={disabled}
          style={sourceButtonStyle}
          styles={sourceButtonStyles}
        >
          {t("certSign.source.upload", "Upload")}
        </Button>
        {isServerCertificateEnabled && (
          <Button
            variant={parameters.signMode === "AUTO" ? "filled" : "outline"}
            color={
              parameters.signMode === "AUTO" ? "green" : "var(--text-muted)"
            }
            onClick={selectServer}
            disabled={disabled}
            style={sourceButtonStyle}
            styles={sourceButtonStyles}
          >
            {t("certSign.source.server", "Server")}
          </Button>
        )}
        {isHardwareAvailable && (
          <Button
            variant={parameters.signMode === "DEVICE" ? "filled" : "outline"}
            color={
              parameters.signMode === "DEVICE" ? "teal" : "var(--text-muted)"
            }
            onClick={selectDevice}
            disabled={disabled}
            style={sourceButtonStyle}
            styles={sourceButtonStyles}
          >
            {t("certSign.source.device", "This device")}
          </Button>
        )}
      </div>
    </Stack>
  );
};

export default CertificateTypeSettings;
