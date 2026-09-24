import {
  Modal,
  Stack,
  Group,
  Text,
  Collapse,
  TextInput,
  Loader,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
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

  // Advanced settings
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
      opened={opened}
      onClose={onClose}
      title={t(
        "certSign.collab.signRequest.certModal.title",
        "Configure Certificate",
      )}
      centered
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "certSign.collab.signRequest.certModal.description",
            "You have placed {{count}} visible mark(s). Choose a certificate to submit your signature. Visible marks are optional.",
            { count: signatureCount },
          )}
        </Text>

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

        {/* Certificate validation status */}
        {certValidation.status === "validating" && (
          <Group gap="xs">
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
          <Group gap="xs">
            <Icon
              name="circle-check"
              size={20}
              style={{ color: "var(--mantine-color-green-6)" }}
            />
            <Text size="sm" c="var(--color-green-dark)">
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
          <Group gap="xs">
            <Icon
              name="circle-alert"
              size={20}
              style={{ color: "var(--mantine-color-red-6)" }}
            />
            <Text size="sm" c="var(--color-red-dark)">
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

        {/* Advanced Settings - Optional */}
        <div>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={disabled || signing}
            style={{ marginBottom: "8px" }}
          >
            {t(
              "certSign.collab.signRequest.advancedSettings",
              "Advanced Settings",
            )}
          </Button>

          <Collapse in={showAdvanced}>
            <Stack gap="sm">
              <TextInput
                label={t(
                  "certSign.collab.signRequest.reason",
                  "Reason (Optional)",
                )}
                placeholder={t(
                  "certSign.collab.signRequest.reasonPlaceholder",
                  "Why are you signing?",
                )}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
                disabled={disabled || signing}
              />
              <TextInput
                label={t(
                  "certSign.collab.signRequest.location",
                  "Location (Optional)",
                )}
                placeholder={t(
                  "certSign.collab.signRequest.locationPlaceholder",
                  "Where are you signing from?",
                )}
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value)}
                disabled={disabled || signing}
              />
            </Stack>
          </Collapse>
        </div>

        <Group justify="space-between" wrap="wrap" mt="md">
          <Button variant="secondary" onClick={onClose} disabled={signing}>
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
          >
            {t("certSign.collab.signRequest.certModal.sign", "Sign Document")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
