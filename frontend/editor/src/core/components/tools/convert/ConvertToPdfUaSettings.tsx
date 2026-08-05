import { Stack, Text, Select, Alert, Checkbox, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import { usePdfSignatureDetection } from "@app/hooks/usePdfSignatureDetection";
import { StirlingFile } from "@app/types/fileContext";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface ConvertToPdfUaSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  selectedFiles: StirlingFile[];
  disabled?: boolean;
}

/**
 * Options for the PDF/UA (accessibility) conversion.
 *
 * The wording here matters as much as the controls. The converter only declares conformance when
 * validation actually passes, and it never invents descriptions for images, so the panel says what
 * the user will have to do rather than implying the conversion is a single click.
 */
const ConvertToPdfUaSettings = ({
  parameters,
  onParameterChange,
  selectedFiles,
  disabled = false,
}: ConvertToPdfUaSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures } = usePdfSignatureDetection(selectedFiles);

  const profileOptions = [
    { value: "ua1", label: "PDF/UA-1" },
    { value: "ua2", label: "PDF/UA-2 (PDF 2.0)" },
  ];

  const update = (patch: Partial<ConvertParameters["pdfUaOptions"]>) =>
    onParameterChange("pdfUaOptions", { ...parameters.pdfUaOptions, ...patch });

  return (
    <Stack gap="sm" data-testid="pdfua-settings">
      <Text size="sm" fw={500}>
        {t("convert.pdfUaOptions", "PDF/UA Options")}:
      </Text>

      {hasDigitalSignatures && (
        <Alert color="yellow">
          <Text size="sm">
            {t(
              "convert.pdfUaSignatureWarning",
              "This PDF is digitally signed. Tagging rewrites the page content the signature covers, so the signature will stop verifying. Convert first, then re-sign.",
            )}
          </Text>
        </Alert>
      )}

      <Stack gap="xs">
        <Text size="xs" fw={500}>
          {t("convert.pdfUaProfile", "Conformance level")}:
        </Text>
        <Select
          value={parameters.pdfUaOptions.profile}
          onChange={(value) => update({ profile: value || "ua1" })}
          data={profileOptions}
          disabled={disabled}
          comboboxProps={{ zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
          data-testid="pdfua-profile-select"
        />
      </Stack>

      <TextInput
        label={t("convert.pdfUaLanguage", "Document language")}
        description={t(
          "convert.pdfUaLanguageHelp",
          "A BCP-47 tag such as en-GB. Required so a screen reader uses the right pronunciation.",
        )}
        value={parameters.pdfUaOptions.language}
        onChange={(event) => update({ language: event.currentTarget.value })}
        disabled={disabled}
        data-testid="pdfua-language-input"
      />

      <TextInput
        label={t("convert.pdfUaTitle", "Document title")}
        description={t(
          "convert.pdfUaTitleHelp",
          "Shown by a reader instead of the filename. Left blank, the first heading is used.",
        )}
        value={parameters.pdfUaOptions.title}
        onChange={(event) => update({ title: event.currentTarget.value })}
        disabled={disabled}
        data-testid="pdfua-title-input"
      />

      <Checkbox
        label={t("convert.pdfUaEmbedFonts", "Embed missing fonts")}
        description={t(
          "convert.pdfUaEmbedFontsHelp",
          "PDF/UA requires every font to be embedded. Turning this off is faster but usually prevents conformance.",
        )}
        checked={parameters.pdfUaOptions.embedFonts}
        onChange={(event) =>
          update({ embedFonts: event.currentTarget.checked })
        }
        disabled={disabled}
        data-testid="pdfua-embed-fonts"
      />

      <Alert color="blue">
        <Text size="sm">
          {t(
            "convert.pdfUaAltTextNotice",
            "Images need a written description before a document can be certified. Descriptions are never generated automatically, because an invented one passes the checker while telling a screen-reader user nothing. Any image left without one is reported, and the file comes back tagged but not certified.",
          )}
        </Text>
      </Alert>
    </Stack>
  );
};

export default ConvertToPdfUaSettings;
