import { Stack } from "@mantine/core";
import { Button } from "@shared/components/Button";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import { useAppConfig } from "@app/contexts/AppConfigContext";

interface CertificateTypeSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const CertificateTypeSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: CertificateTypeSettingsProps) => {
  const { config } = useAppConfig();
  const isServerCertificateEnabled = config?.serverCertificateEnabled ?? false;

  // Reset to MANUAL if AUTO is selected but feature is disabled
  if (parameters.signMode === "AUTO" && !isServerCertificateEnabled) {
    onParameterChange("signMode", "MANUAL");
  }

  return (
    <Stack gap="md">
      <div style={{ display: "flex", gap: "4px" }}>
        <Button
          variant={parameters.signMode === "MANUAL" ? "primary" : "secondary"}
          onClick={() => {
            onParameterChange("signMode", "MANUAL");
            // Reset cert type when switching to manual
            if (parameters.signMode === "AUTO") {
              onParameterChange("certType", "");
            }
          }}
          disabled={disabled}
          style={{
            flex: 1,
            height: "auto",
            minHeight: "40px",
            fontSize: "11px",
          }}
        >
          <div
            style={{ textAlign: "center", lineHeight: "1.1", fontSize: "11px" }}
          >
            Manual
          </div>
        </Button>
        {isServerCertificateEnabled && (
          <Button
            variant={parameters.signMode === "AUTO" ? "primary" : "secondary"}
            accent={parameters.signMode === "AUTO" ? "success" : undefined}
            onClick={() => {
              onParameterChange("signMode", "AUTO");
              // Clear cert type and files when switching to auto
              onParameterChange("certType", "");
            }}
            disabled={disabled}
            style={{
              flex: 1,
              height: "auto",
              minHeight: "40px",
              fontSize: "11px",
            }}
          >
            <div
              style={{
                textAlign: "center",
                lineHeight: "1.1",
                fontSize: "11px",
              }}
            >
              Auto (server)
            </div>
          </Button>
        )}
      </div>
    </Stack>
  );
};

export default CertificateTypeSettings;
