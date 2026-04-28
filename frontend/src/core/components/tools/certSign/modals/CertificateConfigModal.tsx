import {
  Modal,
  Stack,
  Group,
  Button,
  Text,
  Collapse,
  TextInput,
  Loader,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import {
  CertificateSelector,
  CertificateType,
  UploadFormat,
} from "@app/components/tools/certSign/CertificateSelector";
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
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced certificate pre-validation: fires 600ms after cert file or password changes
  useEffect(() => {
    // Only validate uploaded keystores (not SERVER/USER_CERT, not PEM which uses separate files)
    const keystoreFile = uploadFormat === "JKS" ? jksFile : p12File;
    if (certType !== "UPLOAD" || !keystoreFile || uploadFormat === "PEM") {
      setCertValidation({ status: "idle" });
      return;
    }

    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
    setCertValidation({ status: "validating" });

    validationTimerRef.current = setTimeout(async () => {
      try {
        const formData = new FormData();
        formData.append("certType", uploadFormat === "JKS" ? "JKS" : "P12");
        formData.append("password", password);
        if (uploadFormat === "JKS") {
          formData.append("jksFile", keystoreFile);
        } else {
          formData.append("p12File", keystoreFile);
        }

        const endpoint = participantToken
          ? "/api/v1/workflow/participant/validate-certificate"
          : "/api/v1/security/cert-sign/validate-certificate";

        if (participantToken) {
          formData.append("participantToken", participantToken);
        }

        const response = await apiClient.post<{
          valid: boolean;
          subjectName: string | null;
          notAfter: string | null;
          error: string | null;
        }>(endpoint, formData);

        if (response.data.valid) {
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
      if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
    };
  }, [certType, uploadFormat, p12File, jksFile, password, participantToken]);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const [location, setLocation] = useState(defaultLocation);

  const isUploadValid = () => {
    if (certType !== "UPLOAD") return true;
    switch (uploadFormat) {
      case "PKCS12":
      case "PFX":
        return p12File !== null;
      case "PEM":
        return privateKeyFile !== null && certFile !== null;
      case "JKS":
        return jksFile !== null;
    }
  };

  const isValid =
    certType === "USER_CERT" || certType === "SERVER" || isUploadValid();

  const handleSign = async () => {
    if (!isValid) return;

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
      console.error("Failed to sign document:", error);
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
            "You have placed {{count}} signature(s). Choose your certificate to complete signing.",
            { count: signatureCount },
          )}
        </Text>

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
            <CheckCircleIcon
              fontSize="small"
              style={{ color: "var(--mantine-color-green-6)" }}
            />
            <Text size="sm" c="green">
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
            <ErrorIcon
              fontSize="small"
              style={{ color: "var(--mantine-color-red-6)" }}
            />
            <Text size="sm" c="red">
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
            variant="subtle"
            size="xs"
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
          <Button variant="default" onClick={onClose} disabled={signing}>
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
