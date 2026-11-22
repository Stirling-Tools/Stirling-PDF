import { Group, Input, Stack, Text } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { useTranslation } from "react-i18next";
import FileUploadButton from "@editor/components/shared/FileUploadButton";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
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
        <Group align="center" gap="sm" wrap="nowrap">
          <FileUploadButton
            file={certFile ?? undefined}
            onChange={handleCertFileChange}
            accept=".cer,.crt,.pem,.der"
            disabled={disabled}
            variant="default"
          />
          {certFile && (
            <Button
              variant="tertiary"
              onClick={() => handleCertFileChange(null)}
              disabled={disabled}
            >
              {t("sign.clear", "Clear")}
            </Button>
          )}
        </Group>

        {certFile && (
          <Text size="xs" c="dimmed">
            {t("size", "Size")}: {Math.round(certFile.size / 1024)} KB
          </Text>
        )}
      </Stack>
    </Input.Wrapper>
  );
};

export default ValidateSignatureSettings;
