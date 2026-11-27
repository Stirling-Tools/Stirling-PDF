import { useTranslation } from "react-i18next";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";

interface CertificateFormatSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

const FORMATS = ["PKCS12", "PFX", "PEM", "JKS"] as const;
type CertificateFileFormat = (typeof FORMATS)[number];

function isFileFormat(
  certType: CertSignParameters["certType"],
): certType is CertificateFileFormat {
  return (FORMATS as readonly string[]).includes(certType);
}

const CertificateFormatSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: CertificateFormatSettingsProps) => {
  const { t } = useTranslation();

  return (
    <ButtonSelector<CertificateFileFormat>
      label={t("certSign.certTypeStep.formatLabel", "Format")}
      value={
        isFileFormat(parameters.certType) ? parameters.certType : undefined
      }
      onChange={(format) => onParameterChange("certType", format)}
      options={FORMATS.map((format) => ({ value: format, label: format }))}
      disabled={disabled}
    />
  );
};

export default CertificateFormatSettings;
