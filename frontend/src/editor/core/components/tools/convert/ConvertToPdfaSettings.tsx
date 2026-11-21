import { useId } from "react";
import { Stack, Text, Select, Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { usePdfSignatureDetection } from "@editor/hooks/usePdfSignatureDetection";
import { useEndpointEnabled } from "@editor/hooks/useEndpointConfig";
import { StirlingFile } from "@editor/types/fileContext";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { ToggleSwitch } from "@editor/ui/ToggleSwitch";
import { Icon } from "@editor/ui/Icon";
import styles from "@editor/components/tools/convert/ConvertToPdfaSettings.module.css";

interface ConvertToPdfaSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  selectedFiles: StirlingFile[];
  disabled?: boolean;
}

const ConvertToPdfaSettings = ({
  parameters,
  onParameterChange,
  selectedFiles,
  disabled = false,
}: ConvertToPdfaSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures, isChecking } =
    usePdfSignatureDetection(selectedFiles);
  const outputFormatLabelId = useId();
  // Level A needs the same tagger as PDF/UA, so it stands or falls with that endpoint.
  const { enabled: taggingAvailable } = useEndpointEnabled("pdf-to-ua");

  const pdfaFormatOptions = [
    { value: "pdfa-1", label: "PDF/A-1b" },
    { value: "pdfa-2b", label: "PDF/A-2b" },
    { value: "pdfa-3b", label: "PDF/A-3b" },
    // Level A is level B plus accessibility: it additionally tags the document.
    ...(taggingAvailable === false
      ? []
      : [
          {
            value: "pdfa-1a",
            label: t(
              "convert.pdfaAccessibleFormat",
              "{{format}} (accessible)",
              {
                format: "PDF/A-1a",
              },
            ),
          },
          {
            value: "pdfa-2a",
            label: t(
              "convert.pdfaAccessibleFormat",
              "{{format}} (accessible)",
              {
                format: "PDF/A-2a",
              },
            ),
          },
          {
            value: "pdfa-3a",
            label: t(
              "convert.pdfaAccessibleFormat",
              "{{format}} (accessible)",
              {
                format: "PDF/A-3a",
              },
            ),
          },
        ]),
  ];

  return (
    <Stack gap="sm" data-testid="pdfa-settings">
      <Text size="sm" fw={500}>
        {t("convert.pdfaOptions", "PDF/A Options")}:
      </Text>

      {hasDigitalSignatures && (
        <Alert color="yellow">
          <Text size="sm">
            {t(
              "convert.pdfaDigitalSignatureWarning",
              "The PDF contains a digital signature. This will be removed in the next step.",
            )}
          </Text>
        </Alert>
      )}

      <Stack gap="xs">
        <Text id={outputFormatLabelId} size="xs" fw={500}>
          {t("convert.outputFormat", "Output Format")}:
        </Text>
        <Select
          aria-labelledby={outputFormatLabelId}
          value={parameters.pdfaOptions.outputFormat}
          onChange={(value) =>
            onParameterChange("pdfaOptions", {
              ...parameters.pdfaOptions,
              outputFormat: value || "pdfa-2b",
            })
          }
          data={pdfaFormatOptions}
          disabled={disabled || isChecking}
          data-testid="pdfa-output-format-select"
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
          }}
        />
        <Text size="xs" c="dimmed">
          {t(
            "convert.pdfaNote",
            "PDF/A-1b is more compatible, PDF/A-2b supports more features, PDF/A-3b supports embedded files.",
          )}
        </Text>
      </Stack>

      <div className={styles["pdfa-card"]}>
        <div className={styles["pdfa-strict-toggle"]}>
          <div className={styles["pdfa-strict-info"]}>
            <div className={styles["pdfa-strict-icon"]}>
              <Icon
                name={
                  parameters.pdfaOptions.strict
                    ? "shield-check"
                    : "shield-alert"
                }
                size={18}
              />
            </div>
            <div className={styles["pdfa-strict-text"]}>
              <label
                htmlFor="pdfa-strict-mode-switch"
                className={styles["pdfa-strict-title"]}
              >
                {t("convert.strictMode", "Strict Mode")}
              </label>
              <span
                id="pdfa-strict-mode-desc"
                className={styles["pdfa-strict-desc"]}
              >
                {t(
                  "convert.strictModeDesc",
                  "Enforces 100% VeraPDF compliance and rejects non-conforming outputs",
                )}
              </span>
            </div>
          </div>
          <ToggleSwitch
            id="pdfa-strict-mode-switch"
            checked={parameters.pdfaOptions.strict ?? false}
            onChange={(checked) =>
              onParameterChange("pdfaOptions", {
                ...parameters.pdfaOptions,
                strict: checked,
              })
            }
            disabled={disabled || isChecking}
            aria-describedby="pdfa-strict-mode-desc"
            aria-label={t("convert.strictMode", "Strict Mode")}
            data-testid="pdfa-strict-mode-toggle"
          />
        </div>
      </div>
    </Stack>
  );
};

export default ConvertToPdfaSettings;
