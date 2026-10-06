import { Stack, Text } from "@mantine/core";
import { Radio } from "@app/ui/Radio";
import { Icon, type IconName } from "@app/ui/Icon";
import { FormField } from "@app/ui/FormField";
import { Input } from "@app/ui/Input";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import { useEffect, useId } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import FileUploadButton from "@app/components/shared/FileUploadButton";
import "@app/components/tools/certSign/CertificateSelector.css";

export type CertificateType = "USER_CERT" | "SERVER" | "UPLOAD";
export type UploadFormat = "PKCS12" | "PFX" | "PEM" | "JKS";

function CertificateChoice({
  name,
  value,
  selected,
  onSelect,
  disabled,
  icon,
  title,
  description,
}: {
  name: string;
  value: CertificateType;
  selected: CertificateType;
  onSelect: (value: CertificateType) => void;
  disabled: boolean;
  icon: IconName;
  title: string;
  description: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Radio
      className="certificate-choice"
      name={name}
      value={value}
      checked={selected === value}
      onChange={() => onSelect(value)}
      disabled={disabled}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      label={
        <span className="certificate-choice__content">
          <span className="certificate-choice__icon" aria-hidden>
            <Icon name={icon} size={22} />
          </span>
          <span className="certificate-choice__copy">
            <span id={titleId} className="certificate-choice__title">
              {title}
            </span>
            <span
              id={descriptionId}
              className="certificate-choice__description"
            >
              {description}
            </span>
          </span>
        </span>
      }
    />
  );
}

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
  const choiceName = useId();
  const { config } = useAppConfig();
  const personalCertificateAvailable = config?.runningProOrHigher ?? false;
  const serverCertificateAvailable = config?.serverCertificateEnabled ?? false;
  const managedCertificateAvailable =
    personalCertificateAvailable || serverCertificateAvailable;

  useEffect(() => {
    if (
      (certType === "USER_CERT" && !personalCertificateAvailable) ||
      (certType === "SERVER" && !serverCertificateAvailable)
    ) {
      onCertTypeChange(serverCertificateAvailable ? "SERVER" : "UPLOAD");
    }
  }, [
    personalCertificateAvailable,
    serverCertificateAvailable,
    certType,
    onCertTypeChange,
  ]);

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
      {managedCertificateAvailable && (
        <div
          className="certificate-choices"
          role="radiogroup"
          aria-label={t(
            "certSign.collab.signRequest.certificateChoice",
            "Select a certificate to sign with",
          )}
        >
          {personalCertificateAvailable && (
            <CertificateChoice
              name={choiceName}
              value="USER_CERT"
              selected={certType}
              onSelect={onCertTypeChange}
              disabled={disabled}
              icon="user"
              title={t(
                "certSign.collab.signRequest.usePersonalCert",
                "Stirling Sign · Personal",
              )}
              description={t(
                "certSign.collab.signRequest.usePersonalCertDesc",
                "Sign with the certificate created for your account.",
              )}
            />
          )}
          {serverCertificateAvailable && (
            <CertificateChoice
              name={choiceName}
              value="SERVER"
              selected={certType}
              onSelect={onCertTypeChange}
              disabled={disabled}
              icon="building-2"
              title={t(
                "certSign.collab.signRequest.useServerCert",
                "Stirling Sign · Organization",
              )}
              description={t(
                "certSign.collab.signRequest.useServerCertDesc",
                "Sign with this server's shared organization certificate.",
              )}
            />
          )}
          <CertificateChoice
            name={choiceName}
            value="UPLOAD"
            selected={certType}
            onSelect={onCertTypeChange}
            disabled={disabled}
            icon="upload"
            title={t(
              "certSign.collab.signRequest.uploadCert",
              "Upload a certificate",
            )}
            description={t(
              "certSign.collab.signRequest.uploadCertDesc",
              "Use your own PKCS12, PFX, PEM or JKS certificate.",
            )}
          />
        </div>
      )}

      {certType === "UPLOAD" && (
        <Stack gap="md" className="certificate-upload">
          <Text size="sm" fw={600} c="var(--c-text)">
            {t(
              "certSign.collab.signRequest.certModal.format",
              "Certificate format",
            )}
          </Text>
          <SegmentedControl<UploadFormat>
            options={(["PKCS12", "PFX", "PEM", "JKS"] as UploadFormat[]).map(
              (format) => ({ value: format, label: format }),
            )}
            value={uploadFormat}
            onChange={handleFormatChange}
            disabled={disabled}
            ariaLabel={t(
              "certSign.collab.signRequest.certModal.format",
              "Certificate format",
            )}
            fullWidth
            variant="secondary"
          />

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

          {/* PEM — private key and certificate are two separate files */}
          {uploadFormat === "PEM" && (
            <Stack gap="sm">
              <Stack gap={4}>
                <Text size="xs" fw={600}>
                  {t(
                    "certSign.pemPrivateKeyLabel",
                    "Private key (.pem / .key)",
                  )}
                </Text>
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
              </Stack>
              <Stack gap={4}>
                <Text size="xs" fw={600}>
                  {t(
                    "certSign.pemCertificateLabel",
                    "Certificate (.pem / .crt)",
                  )}
                </Text>
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
              </Stack>
            </Stack>
          )}

          {uploadFormat === "JKS" && (
            <FileUploadButton
              file={jksFile ?? undefined}
              onChange={(file) => onJksFileChange(file || null)}
              accept=".jks,.keystore"
              disabled={disabled}
              placeholder={t("certSign.chooseJksFile", "Choose JKS File")}
            />
          )}

          {showPassword && (
            <FormField
              label={t(
                "certSign.collab.signRequest.password",
                "Certificate Password",
              )}
            >
              <Input
                type="password"
                placeholder={t(
                  "certSign.passwordOptional",
                  "Leave empty if no password",
                )}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                disabled={disabled}
              />
            </FormField>
          )}
        </Stack>
      )}
    </Stack>
  );
};
