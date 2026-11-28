/**
 * CertSignAutomationSettings - Used for automation only
 *
 * This component combines all certificate signing settings into a single step interface
 * for use in the automation system. It includes sign mode, certificate format, certificate files,
 * and signature appearance settings in one unified component.
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import { CertSignParameters } from "@editor/hooks/tools/certSign/useCertSignParameters";
import CertificateTypeSettings from "@editor/components/tools/certSign/CertificateTypeSettings";
import CertificateFormatSettings from "@editor/components/tools/certSign/CertificateFormatSettings";
import CertificateFilesSettings from "@editor/components/tools/certSign/CertificateFilesSettings";
import HardwareCertificateSettings from "@editor/components/tools/certSign/HardwareCertificateSettings";
import SignatureAppearanceSettings from "@editor/components/tools/certSign/SignatureAppearanceSettings";
import { useDefaultStampPreview } from "@editor/hooks/tools/certSign/useCertSignStampPlacement";
import type { HardwareCertificateInfo } from "@editor/services/hardwareSigningService";

interface CertSignAutomationSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

const CertSignAutomationSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: CertSignAutomationSettingsProps) => {
  const [deviceCertificate, setDeviceCertificate] =
    useState<HardwareCertificateInfo | null>(null);
  const preview = useDefaultStampPreview(parameters, deviceCertificate);
  return (
    <Stack gap="lg">
      {/* Sign Mode Selection (Manual vs Auto) */}
      <CertificateTypeSettings
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
      />

      {/* Certificate Format - only show for Manual mode */}
      {parameters.signMode === "MANUAL" && (
        <CertificateFormatSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      )}

      {/* Certificate Files - only show for Manual mode */}
      {parameters.signMode === "MANUAL" && (
        <CertificateFilesSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      )}

      {/* Hardware certificate (Windows store / USB token) - desktop only */}
      {parameters.signMode === "DEVICE" && (
        <HardwareCertificateSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
          onChosenCertificateChange={setDeviceCertificate}
        />
      )}

      {/* Signature Appearance Settings */}
      <SignatureAppearanceSettings
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
        preview={preview}
      />
    </Stack>
  );
};

export default CertSignAutomationSettings;
