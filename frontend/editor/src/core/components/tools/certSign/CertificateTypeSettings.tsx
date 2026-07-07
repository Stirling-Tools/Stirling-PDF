import { Button } from "@app/ui/Button";
import { useEffect } from "react";
import { Stack } from "@mantine/core";
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
      {!isServerCertificateEnabled && !isHardwareAvailable && (
        <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>
          {t(
            "certSign.source.noOtherSources",
            "No other certificate sources are available.",
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: "4px" }}>
        <Button
          variant={parameters.signMode === "MANUAL" ? "primary" : "secondary"}
          accent={parameters.signMode === "MANUAL" ? "default" : "neutral"}
          onClick={selectUpload}
          disabled={disabled}
          style={sourceButtonStyle}
        >
          {t("certSign.source.upload", "Upload")}
        </Button>
        {isServerCertificateEnabled && (
          <Button
            variant={parameters.signMode === "AUTO" ? "primary" : "secondary"}
            accent={parameters.signMode === "AUTO" ? "default" : "neutral"}
            onClick={selectServer}
            disabled={disabled}
            style={sourceButtonStyle}
          >
            {t("certSign.source.server", "Server")}
          </Button>
        )}
        {isHardwareAvailable && (
          <Button
            variant={parameters.signMode === "DEVICE" ? "primary" : "secondary"}
            accent={parameters.signMode === "DEVICE" ? "default" : "neutral"}
            onClick={selectDevice}
            disabled={disabled}
            style={sourceButtonStyle}
          >
            {t("certSign.source.device", "This device")}
          </Button>
        )}
      </div>
    </Stack>
  );
};

export default CertificateTypeSettings;
