import { useEffect } from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import ButtonSelector, {
  type ButtonOption,
} from "@editor/components/shared/ButtonSelector";

interface CertificateTypeSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

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

  const hasAlternativeSources =
    isServerCertificateEnabled || isHardwareAvailable;

  if (!hasAlternativeSources) {
    return (
      <Stack gap="md">
        <div style={{ color: "var(--c-text-subtle)", fontSize: "11px" }}>
          {t(
            "certSign.source.noOtherSources",
            "No other certificate sources are available.",
          )}
        </div>
      </Stack>
    );
  }

  const sourceOptions: ButtonOption<CertSignParameters["signMode"]>[] = [
    { value: "MANUAL", label: t("certSign.source.upload", "Upload") },
    ...(isServerCertificateEnabled
      ? [
          {
            value: "AUTO" as const,
            label: t("certSign.source.server", "Server"),
          },
        ]
      : []),
    ...(isHardwareAvailable
      ? [
          {
            value: "DEVICE" as const,
            label: t("certSign.source.device", "This device"),
          },
        ]
      : []),
  ];

  const selectSource = (mode: CertSignParameters["signMode"]) => {
    if (mode === "AUTO") selectServer();
    else if (mode === "DEVICE") selectDevice();
    else selectUpload();
  };

  return (
    <ButtonSelector
      ariaLabel={t("certSign.source.stepTitle", "Certificate source")}
      value={parameters.signMode}
      onChange={selectSource}
      options={sourceOptions}
      disabled={disabled}
    />
  );
};

export default CertificateTypeSettings;
