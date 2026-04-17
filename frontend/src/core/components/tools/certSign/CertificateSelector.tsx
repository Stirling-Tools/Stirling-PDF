import {
  Stack,
  Radio,
  Divider,
  TextInput,
  Text,
  Group,
  Button,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import FileUploadButton from "@app/components/shared/FileUploadButton";

export type CertificateType = "USER_CERT" | "SERVER" | "UPLOAD";
export type UploadFormat = "PKCS12" | "PFX" | "PEM" | "JKS";

interface CertificateSelectorProps {
  certType: CertificateType;
  onCertTypeChange: (certType: CertificateType) => void;
  uploadFormat: UploadFormat;
  onUploadFormatChange: (format: UploadFormat) => void;
  p12File: File | null;
  onP12FileChange: (file: File | null) => void;
  privateKeyFile: File | null;
  onPrivateKeyFileChange: (file: File | null) => void;
  certFile: File | null;
  onCertFileChange: (file: File | null) => void;
  jksFile: File | null;
  onJksFileChange: (file: File | null) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  disabled?: boolean;
}

export const CertificateSelector: React.FC<CertificateSelectorProps> = ({
  certType,
  onCertTypeChange,
  uploadFormat,
  onUploadFormatChange,
  p12File,
  onP12FileChange,
  privateKeyFile,
  onPrivateKeyFileChange,
  certFile,
  onCertFileChange,
  jksFile,
  onJksFileChange,
  password,
  onPasswordChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const isServerPlan = config?.runningProOrHigher ?? false;

  // If managed cert types are not available, reset to UPLOAD
  useEffect(() => {
    if (!isServerPlan && (certType === "USER_CERT" || certType === "SERVER")) {
      onCertTypeChange("UPLOAD");
    }
  }, [isServerPlan, certType, onCertTypeChange]);

  const handleFormatChange = (fmt: UploadFormat) => {
    onUploadFormatChange(fmt);
    onP12FileChange(null);
    onPrivateKeyFileChange(null);
    onCertFileChange(null);
    onJksFileChange(null);
    onPasswordChange("");
  };

  const showPassword =
    ((uploadFormat === "PKCS12" || uploadFormat === "PFX") && p12File) ||
    (uploadFormat === "PEM" && privateKeyFile && certFile) ||
    (uploadFormat === "JKS" && jksFile);

  return (
    <Stack gap="md">
      {/* Managed certificate options — server plan only */}
      {isServerPlan && (
        <Radio.Group
          value={certType}
          onChange={(val) => onCertTypeChange(val as CertificateType)}
        >
          <Stack gap="sm">
            <Radio
              value="USER_CERT"
              disabled={disabled}
              label={
                <Stack gap={1}>
                  <Text size="sm" fw={500}>
                    {t(
                      "certSign.collab.signRequest.usePersonalCert",
                      "Personal Certificate",
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(
                      "certSign.collab.signRequest.usePersonalCertDesc",
                      "Auto-generated for your account",
                    )}
                  </Text>
                </Stack>
              }
            />
            <Radio
              value="SERVER"
              disabled={disabled}
              label={
                <Stack gap={1}>
                  <Text size="sm" fw={500}>
                    {t(
                      "certSign.collab.signRequest.useServerCert",
                      "Organization Certificate",
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(
                      "certSign.collab.signRequest.useServerCertDesc",
                      "Shared organization certificate",
                    )}
                  </Text>
                </Stack>
              }
            />
            <Radio
              value="UPLOAD"
              disabled={disabled}
              label={
                <Text size="sm" fw={500}>
                  {t(
                    "certSign.collab.signRequest.uploadCert",
                    "Custom Certificate",
                  )}
                </Text>
              }
            />
          </Stack>
        </Radio.Group>
      )}

      {/* Upload section */}
      {certType === "UPLOAD" && (
        <Stack gap="sm">
          {isServerPlan && (
            <Divider
              label={t(
                "certSign.collab.signRequest.uploadCert",
                "Custom Certificate",
              )}
              labelPosition="left"
            />
          )}

          {/* Format picker */}
          <Group gap="xs">
            {(["PKCS12", "PFX", "PEM", "JKS"] as UploadFormat[]).map((fmt) => (
              <Button
                key={fmt}
                size="xs"
                variant={uploadFormat === fmt ? "filled" : "light"}
                onClick={() => handleFormatChange(fmt)}
                disabled={disabled}
              >
                {fmt}
              </Button>
            ))}
          </Group>

          {/* PKCS12 / PFX */}
          {(uploadFormat === "PKCS12" || uploadFormat === "PFX") && (
            <FileUploadButton
              file={p12File ?? undefined}
              onChange={(file) => onP12FileChange(file || null)}
              accept=".p12,.pfx"
              disabled={disabled}
              placeholder={
                uploadFormat === "PFX"
                  ? t("certSign.choosePfxFile", "Choose PFX File")
                  : t("certSign.chooseP12File", "Choose PKCS12 File")
              }
            />
          )}

          {/* PEM */}
          {uploadFormat === "PEM" && (
            <Stack gap="xs">
              <FileUploadButton
                file={privateKeyFile ?? undefined}
                onChange={(file) => onPrivateKeyFileChange(file || null)}
                accept=".pem,.der,.key"
                disabled={disabled}
                placeholder={t(
                  "certSign.choosePrivateKey",
                  "Choose Private Key File",
                )}
              />
              {privateKeyFile && (
                <FileUploadButton
                  file={certFile ?? undefined}
                  onChange={(file) => onCertFileChange(file || null)}
                  accept=".pem,.der,.crt,.cer"
                  disabled={disabled}
                  placeholder={t(
                    "certSign.chooseCertificate",
                    "Choose Certificate File",
                  )}
                />
              )}
            </Stack>
          )}

          {/* JKS */}
          {uploadFormat === "JKS" && (
            <FileUploadButton
              file={jksFile ?? undefined}
              onChange={(file) => onJksFileChange(file || null)}
              accept=".jks,.keystore"
              disabled={disabled}
              placeholder={t("certSign.chooseJksFile", "Choose JKS File")}
            />
          )}

          {/* Password */}
          {showPassword && (
            <TextInput
              label={t(
                "certSign.collab.signRequest.password",
                "Certificate Password",
              )}
              type="password"
              placeholder={t(
                "certSign.passwordOptional",
                "Leave empty if no password",
              )}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              disabled={disabled}
              size="sm"
            />
          )}
        </Stack>
      )}
    </Stack>
  );
};
