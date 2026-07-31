import { SimpleGrid } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

interface CertificateFormatSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const FORMATS = ["PKCS12", "PFX", "PEM", "JKS"] as const;

const CertificateFormatSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: CertificateFormatSettingsProps) => {
  return (
    <SimpleGrid cols={2} spacing="xs">
      {FORMATS.map((format) => (
        <Button
          key={format}
          variant={parameters.certType === format ? "primary" : "secondary"}
          accent="default"
          fullWidth
          disabled={disabled}
          onClick={() => onParameterChange("certType", format)}
          text={format}
        />
      ))}
    </SimpleGrid>
  );
};

export default CertificateFormatSettings;
