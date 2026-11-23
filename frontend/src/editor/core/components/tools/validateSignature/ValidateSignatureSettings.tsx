import { Input, Stack, Text } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import FileUploadButton from "@editor/components/shared/FileUploadButton";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import classes from "@editor/components/tools/validateSignature/ValidateSignatureSettings.module.css";
import { ValidateSignatureParameters } from "@editor/hooks/tools/validateSignature/useValidateSignatureParameters";

interface ValidateSignatureSettingsProps {
  parameters: ValidateSignatureParameters;
  onParameterChange: <K extends keyof ValidateSignatureParameters>(
    parameter: K,
    value: ValidateSignatureParameters[K],
  ) => void;
  disabled?: boolean;
}

const ValidateSignatureSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ValidateSignatureSettingsProps) => {
  const { t } = useTranslation();
  const certFile = parameters.certFile;

  const handleCertFileChange = (file: File | null) => {
    onParameterChange("certFile", file);
  };

  return (
    <Input.Wrapper
      {...infoLabelProps(
        t("validateSignature.selectCustomCert", "Trusted certificate"),
        t(
          "validateSignature.settings.certHint",
          "Upload a trusted X.509 certificate to validate against a custom trust source.",
        ),
      )}
    >
      <Stack gap="xs" mt={4}>
        <div className={classes.certRow}>
          <FileUploadButton
            file={certFile ?? undefined}
            onChange={handleCertFileChange}
            accept=".cer,.crt,.pem,.der"
            disabled={disabled}
            variant="default"
          />
          {certFile && (
            <Button
              variant="secondary"
              px="none"
              className={classes.remove}
              onClick={() => handleCertFileChange(null)}
              disabled={disabled}
              aria-label={t(
                "validateSignature.settings.removeCert",
                "Remove certificate",
              )}
            >
              <Icon name="x" size={16} />
            </Button>
          )}
        </div>
        <Text size="xs" style={{ color: "var(--c-text-muted)" }}>
          {certFile
            ? t(
                "validateSignature.settings.certOnly",
                "Signatures are checked against this certificate only ({{size}} KB).",
                { size: Math.round(certFile.size / 1024) },
              )
            : t(
                "validateSignature.settings.noCert",
                "No trusted certificate. Signatures are checked against the server's trusted certificates.",
              )}
        </Text>
      </Stack>
    </Input.Wrapper>
  );
};

export default ValidateSignatureSettings;
