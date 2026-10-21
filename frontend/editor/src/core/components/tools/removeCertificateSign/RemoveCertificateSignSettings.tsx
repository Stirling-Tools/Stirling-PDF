import React from "react";
import { Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RemoveCertificateSignParameters } from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";

interface RemoveCertificateSignSettingsProps {
  parameters: RemoveCertificateSignParameters;
  onParameterChange: <K extends keyof RemoveCertificateSignParameters>(
    parameter: K,
    value: RemoveCertificateSignParameters[K],
  ) => void;
  disabled?: boolean;
}

const RemoveCertificateSignSettings: React.FC<
  RemoveCertificateSignSettingsProps
> = ({ parameters, onParameterChange, disabled = false }) => {
  const { t } = useTranslation();

  return (
    <div className="remove-certificate-sign-settings">
      <p className="text-muted">
        {t(
          "removeCertSign.description",
          "This tool will remove digital certificate signatures from your PDF document.",
        )}
      </p>
      <Checkbox
        label={t(
          "removeCertSign.removeVisibleSignature",
          "Remove visible signature",
        )}
        description={t(
          "removeCertSign.removeVisibleSignatureDescription",
          "Also remove the certificate's visible signature. Signatures in scanned images or embedded in page content will remain.",
        )}
        checked={parameters.removeVisibleSignature}
        onChange={(event) =>
          onParameterChange(
            "removeVisibleSignature",
            event.currentTarget.checked,
          )
        }
        disabled={disabled}
      />
    </div>
  );
};

export default RemoveCertificateSignSettings;
