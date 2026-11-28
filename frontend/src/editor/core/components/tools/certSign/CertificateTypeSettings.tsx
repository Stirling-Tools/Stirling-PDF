import { useEffect, useState } from "react";
import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import ButtonSelector, {
  type ButtonOption,
} from "@editor/components/shared/ButtonSelector";
import {
  getServerSigningCertificate,
  HardwareCertificateInfo,
} from "@editor/services/hardwareSigningService";
import { DigitalIdSummary } from "@editor/components/tools/certSign/DigitalIdList";

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

  const [serverCert, setServerCert] = useState<
    HardwareCertificateInfo | null | undefined
  >(undefined);
  useEffect(() => {
    if (parameters.signMode !== "AUTO" || serverCert !== undefined) {
      return;
    }
    let cancelled = false;
    getServerSigningCertificate().then((cert) => {
      if (!cancelled) setServerCert(cert);
    });
    return () => {
      cancelled = true;
    };
  }, [parameters.signMode, serverCert]);

  // Server certificates can be regenerated, so signing is tied to the one shown here.
  const serverSha256 =
    parameters.signMode === "AUTO"
      ? (serverCert?.sha256 ?? undefined)
      : undefined;
  useEffect(() => {
    if (
      parameters.signMode === "AUTO" &&
      serverCert !== undefined &&
      parameters.expectedCertificateSha256 !== serverSha256
    ) {
      onParameterChange("expectedCertificateSha256", serverSha256);
    }
  }, [
    parameters.signMode,
    parameters.expectedCertificateSha256,
    serverCert,
    serverSha256,
    onParameterChange,
  ]);

  const selectUpload = () => {
    onParameterChange("signMode", "MANUAL");
    if (parameters.signMode !== "MANUAL") {
      onParameterChange("certType", "");
    }
  };

  const selectServer = () => {
    if (serverCert === null) setServerCert(undefined);
    onParameterChange("signMode", "AUTO");
    onParameterChange("certType", "");
  };

  const selectDevice = () => {
    onParameterChange("signMode", "DEVICE");
    // Default to the OS store; the device step swaps in this platform's store or a token.
    if (
      parameters.certType !== "WINDOWS_STORE" &&
      parameters.certType !== "MACOS_KEYCHAIN" &&
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
    <Stack gap="md">
      <ButtonSelector
        ariaLabel={t("certSign.source.stepTitle", "Certificate source")}
        value={parameters.signMode}
        onChange={selectSource}
        options={sourceOptions}
        disabled={disabled}
      />
      {parameters.signMode === "AUTO" && serverCert !== undefined && (
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            {t("certSign.source.signsAs", "Signs as")}
          </Text>
          {serverCert ? (
            <DigitalIdSummary cert={serverCert} />
          ) : (
            <Text size="sm" c="dimmed">
              {t(
                "certSign.source.serverCertUnavailable",
                "The server's signing certificate isn't available.",
              )}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default CertificateTypeSettings;
