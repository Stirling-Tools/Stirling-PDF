import { Stack, Group, Text, Collapse, Loader } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import { FormField } from "@app/ui/FormField";
import { Input } from "@app/ui/Input";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo } from "react";
import { Icon } from "@app/ui/Icon";
import {
  CertificateSelector,
  CertificateType,
  UploadFormat,
} from "@app/components/tools/certSign/CertificateSelector";
import { isAxiosError } from "axios";
import apiClient from "@app/services/apiClient";

export interface CertificateSubmitData {
  certType: CertificateType;
  uploadFormat: UploadFormat;
  p12File: File | null;
  privateKeyFile: File | null;
  certFile: File | null;
  jksFile: File | null;
  password: string;
}

type CertValidationState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "valid"; subjectName: string | null; notAfter: string | null }
  | { status: "error"; message: string };

interface CertificateConfigModalProps {
  opened: boolean;
  onClose: () => void;
  onSign: (
    certData: CertificateSubmitData,
    reason?: string,
    location?: string,
  ) => Promise<void>;
  signatureCount: number;
  disabled?: boolean;
  defaultReason?: string;
  defaultLocation?: string;
  /** Share token for external participants. When present, the participant validation endpoint is used. */
  participantToken?: string;
}

export const CertificateConfigModal: React.FC<CertificateConfigModalProps> = ({
  opened,
  onClose,
  onSign,
  signatureCount,
  disabled = false,
  defaultReason = "",
  defaultLocation = "",
  participantToken,
}) => {
  const { t } = useTranslation();

  const [certType, setCertType] = useState<CertificateType>("USER_CERT");
  const [uploadFormat, setUploadFormat] = useState<UploadFormat>("PKCS12");
  const [p12File, setP12File] = useState<File | null>(null);
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [jksFile, setJksFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [signing, setSigning] = useState(false);
  const [certValidation, setCertValidation] = useState<CertValidationState>({
    status: "idle",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validatedPayload, setValidatedPayload] = useState<FormData | null>(
    null,
  );
  const validationPayload = useMemo(() => {
    if (certType !== "UPLOAD") return null;
    const form = new FormData();
    form.append("password", password);
    if (participantToken) form.append("participantToken", participantToken);
    if (uploadFormat === "PEM") {
      if (!privateKeyFile || !certFile) return null;
      form.append("certType", "PEM");
      form.append("privateKeyFile", privateKeyFile);
      form.append("certFile", certFile);
    } else {
      const file = uploadFormat === "JKS" ? jksFile : p12File;
      if (!file) return null;
      form.append("certType", uploadFormat === "JKS" ? "JKS" : "P12");
      form.append(uploadFormat === "JKS" ? "jksFile" : "p12File", file);
    }
    return form;
  }, [
    certType,
    uploadFormat,
    p12File,
    jksFile,
    privateKeyFile,
    certFile,
    password,
    participantToken,
  ]);

  useEffect(() => {
    setSubmitError(null);
    setValidatedPayload(null);
    if (!opened || !validationPayload) {
      setCertValidation({ status: "idle" });
      return;
    }
    let active = true;
    const abort = new AbortController();
    setCertValidation({ status: "validating" });
    const timer = setTimeout(async () => {
      try {
        const endpoint = participantToken
          ? "/api/v1/workflow/participant/validate-certificate"
          : "/api/v1/security/cert-sign/validate-certificate";
        const response = await apiClient.post<{
          valid: boolean;
          subjectName: string | null;
          notAfter: string | null;
          error: string | null;
        }>(endpoint, validationPayload, {
          signal: abort.signal,
          suppressErrorToast: true,
        });
        if (!active) return;
        if (response.data.valid) {
          setValidatedPayload(validationPayload);
          setCertValidation({
            status: "valid",
            subjectName: response.data.subjectName,
            notAfter: response.data.notAfter,
          });
        } else {
          setCertValidation({
            status: "error",
            message:
              response.data.error ??
              t(
                "certSign.collab.signRequest.certModal.certInvalidFallback",
                "Invalid certificate",
              ),
          });
        }
      } catch {
        if (active)
          setCertValidation({
            status: "error",
            message: t(
              "certSign.collab.signRequest.certModal.certNetworkError",
              "Could not validate certificate",
            ),
          });
      }
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [opened, validationPayload, participantToken, t]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const [location, setLocation] = useState(defaultLocation);

  const isValid =
    certType !== "UPLOAD" ||
    (validationPayload !== null &&
      validatedPayload === validationPayload &&
      certValidation.status === "valid");

  const handleSign = async () => {
    if (!isValid) return;

    setSubmitError(null);
    setSigning(true);
    try {
      await onSign(
        {
          certType,
          uploadFormat,
          p12File,
          privateKeyFile,
          certFile,
          jksFile,
          password,
        },
        reason,
        location,
      );
    } catch (error) {
      const data: unknown = isAxiosError(error) ? error.response?.data : null;
      const detail =
        data && typeof data === "object" && "detail" in data
          ? data.detail
          : null;
      setSubmitError(
        typeof detail === "string"
          ? detail
          : typeof data === "string"
            ? data
            : t(
                "signMenu.signFailed",
                "Signing failed. Check your certificate and try again; your placed marks are preserved.",
              ),
      );
    } finally {
      setSigning(false);
    }
  };

  return (
    <Modal
      open={opened}
      onClose={() => {
        if (!signing && !disabled) onClose();
      }}
      title={t(
        "certSign.collab.signRequest.certModal.title",
        "Choose how to sign",
      )}
      subtitle={t(
        "certSign.collab.signRequest.certModal.description",
        "Choose a certificate to complete your signature.",
        {
          count: signatureCount,
        },
      )}
      width="md"
      disableBackdropClose={signing || disabled}
      disableEscapeClose={signing || disabled}
      footer={
        <Group
          justify="space-between"
          wrap="wrap"
          className="certificate-config__footer"
        >
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={signing || disabled}
          >
            {t("cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleSign}
            disabled={
              !isValid ||
              disabled ||
              signing ||
              certValidation.status === "validating"
            }
            loading={signing}
            leftSection={<Icon name="shield-check" size={18} />}
          >
            {t("certSign.collab.signRequest.certModal.sign", "Sign Document")}
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        {submitError && (
          <Text role="alert" size="sm" c="var(--c-danger)">
            {submitError}
          </Text>
        )}

        <CertificateSelector
          certType={certType}
          onCertTypeChange={setCertType}
          uploadFormat={uploadFormat}
          onUploadFormatChange={setUploadFormat}
          p12File={p12File}
          onP12FileChange={setP12File}
          privateKeyFile={privateKeyFile}
          onPrivateKeyFileChange={setPrivateKeyFile}
          certFile={certFile}
          onCertFileChange={setCertFile}
          jksFile={jksFile}
          onJksFileChange={setJksFile}
          password={password}
          onPasswordChange={setPassword}
          disabled={disabled || signing}
        />

        {certValidation.status === "validating" && (
          <Group
            gap="xs"
            role="status"
            className="certificate-config__validation"
          >
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              {t(
                "certSign.collab.signRequest.certModal.certValidating",
                "Validating certificate...",
              )}
            </Text>
          </Group>
        )}
        {certValidation.status === "valid" && (
          <Group
            gap="xs"
            role="status"
            className="certificate-config__validation"
          >
            <Icon
              name="circle-check"
              size={20}
              style={{ color: "var(--c-success)" }}
            />
            <Text size="sm" c="var(--c-success)">
              {t(
                "certSign.collab.signRequest.certModal.certValidUntil",
                "Certificate valid until {{date}}",
                {
                  date: certValidation.notAfter
                    ? new Date(certValidation.notAfter).toLocaleDateString()
                    : "—",
                },
              )}
              {certValidation.subjectName
                ? ` · ${certValidation.subjectName}`
                : ""}
            </Text>
          </Group>
        )}
        {certValidation.status === "error" && (
          <Group
            gap="xs"
            role="alert"
            className="certificate-config__validation"
          >
            <Icon
              name="circle-alert"
              size={20}
              style={{ color: "var(--c-danger)" }}
            />
            <Text size="sm" c="var(--c-danger)">
              {t(
                "certSign.collab.signRequest.certModal.certInvalid",
                "Certificate invalid: {{error}}",
                {
                  error: certValidation.message,
                },
              )}
            </Text>
          </Group>
        )}

        <div className="certificate-config__details">
          <Button
            variant="tertiary"
            size="sm"
            accent="neutral"
            className="certificate-config__details-toggle"
            justify="between"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={disabled || signing}
            aria-expanded={showAdvanced}
            rightSection={
              <Icon
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={16}
              />
            }
          >
            {t(
              "certSign.collab.signRequest.certModal.details",
              "Signing details (optional)",
            )}
          </Button>

          <Collapse in={showAdvanced}>
            <div className="certificate-config__fields">
              <FormField
                label={t(
                  "certSign.collab.signRequest.reason",
                  "Reason (Optional)",
                )}
              >
                <Input
                  placeholder={t(
                    "certSign.collab.signRequest.reasonPlaceholder",
                    "Why are you signing?",
                  )}
                  value={reason}
                  onChange={(e) => setReason(e.currentTarget.value)}
                  disabled={disabled || signing}
                />
              </FormField>
              <FormField
                label={t(
                  "certSign.collab.signRequest.location",
                  "Location (Optional)",
                )}
              >
                <Input
                  placeholder={t(
                    "certSign.collab.signRequest.locationPlaceholder",
                    "Where are you signing from?",
                  )}
                  value={location}
                  onChange={(e) => setLocation(e.currentTarget.value)}
                  disabled={disabled || signing}
                />
              </FormField>
            </div>
          </Collapse>
        </div>
      </Stack>
    </Modal>
  );
};
