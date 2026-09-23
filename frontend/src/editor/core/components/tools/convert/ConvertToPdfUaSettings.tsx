import { useEffect, useRef, useState } from "react";
import { Stack, Text, Select, Alert, Checkbox, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { Button } from "@app/ui/Button";
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

/** One image the backend says has no description yet, keyed as the conversion expects it back. */
interface FigureNeedingDescription {
  key: string;
  page: number;
  kind: string;
}

/**
 * The wire form the endpoint parses: one `pageIndex:ordinal=description` per line. Descriptions are
 * kept verbatim so that typing a space does not fight the field; the backend trims them.
 */
export const parseAltText = (raw: string): Record<string, string> => {
  const parsed: Record<string, string> = {};
  raw.split(/\r?\n/).forEach((line) => {
    const split = line.indexOf("=");
    if (split <= 0) return;
    const key = line.slice(0, split).trim();
    const description = line.slice(split + 1);
    if (key && description.trim()) parsed[key] = description;
  });
  return parsed;
};

export const formatAltText = (descriptions: Record<string, string>): string =>
  Object.entries(descriptions)
    .filter(([, description]) => description.trim())
    .map(([key, description]) => `${key}=${description}`)
    .join("\n");

/** PDF/UA conversion options; copy is deliberate - conformance is not guaranteed by one click. */
const ConvertToPdfUaSettings = ({
  parameters,
  onParameterChange,
  selectedFiles,
  disabled = false,
}: ConvertToPdfUaSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures } = usePdfSignatureDetection(selectedFiles);
  const [figures, setFigures] = useState<FigureNeedingDescription[] | null>(
    null,
  );
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const profileOptions = [
    { value: "ua1", label: "PDF/UA-1" },
    { value: "ua2", label: "PDF/UA-2 (PDF 2.0)" },
  ];

  const update = (patch: Partial<ConvertParameters["pdfUaOptions"]>) =>
    onParameterChange("pdfUaOptions", { ...parameters.pdfUaOptions, ...patch });

  const descriptions = parseAltText(parameters.pdfUaOptions.altText);
  // A key is a position inside one document, so descriptions only mean anything for one file.
  const scannableFile = selectedFiles.length === 1 ? selectedFiles[0] : null;
  const tooManyFiles = selectedFiles.length > 1;
  const fileKey = selectedFiles
    .map((file) => `${file.name}:${file.size}`)
    .join("|");
  const describedFileKey = useRef(fileKey);

  // The same key names a different image in the next document, so descriptions must not outlive the
  // selection. Mount is skipped so a stored automation step keeps the text it was saved with.
  useEffect(() => {
    if (describedFileKey.current === fileKey) return;
    describedFileKey.current = fileKey;
    setFigures(null);
    if (parameters.pdfUaOptions.altText) update({ altText: "" });
  }, [fileKey]);

  // The keys are opaque, so they have to come from the backend's own analysis of this file.
  const findFigures = async () => {
    const file = scannableFile;
    if (!file) return;
    setIsScanning(true);
    setScanError(null);
    try {
      const formData = new FormData();
      formData.append("fileInput", file);
      formData.append("profile", parameters.pdfUaOptions.profile);
      const { data } = await apiClient.post<{
        figuresNeedingDescription?: FigureNeedingDescription[];
      }>("/api/v1/security/accessibility-report", formData);
      setFigures(data.figuresNeedingDescription ?? []);
    } catch {
      setScanError(
        t(
          "convert.pdfUaAltTextScanFailed",
          "The images could not be listed. Convert anyway and the response reports what is missing.",
        ),
      );
    } finally {
      setIsScanning(false);
    }
  };

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
          "A BCP-47 tag such as en-GB. Used only when the document does not already declare its own language.",
        )}
        value={parameters.pdfUaOptions.language}
        onChange={(event) => update({ language: event.currentTarget.value })}
        disabled={disabled}
        data-testid="pdfua-language-input"
      />

      <Checkbox
        label={t(
          "convert.pdfUaOverrideLanguage",
          "Replace the document's own language",
        )}
        description={t(
          "convert.pdfUaOverrideLanguageHelp",
          "Only tick this if the language above is right and the document's own is wrong. Relabelling a document into a language it is not written in makes a screen reader unintelligible.",
        )}
        checked={parameters.pdfUaOptions.overrideLanguage}
        onChange={(event) =>
          update({ overrideLanguage: event.currentTarget.checked })
        }
        disabled={disabled}
        data-testid="pdfua-override-language"
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

      {tooManyFiles && (
        <Alert color="yellow" data-testid="pdfua-alt-text-single-file-only">
          <Text size="sm">
            {t(
              "convert.pdfUaAltTextSingleFileOnly",
              "Descriptions belong to one document: an image is identified by its position, which is a different image in every file. Convert these {{fileCount}} files to tag them, then convert one at a time to describe its images.",
              { fileCount: selectedFiles.length },
            )}
          </Text>
        </Alert>
      )}

      {!tooManyFiles && (
        <Button
          variant="secondary"
          onClick={findFigures}
          loading={isScanning}
          disabled={disabled || !scannableFile}
          data-testid="pdfua-find-figures"
        >
          {t("convert.pdfUaFindImages", "Find images needing a description")}
        </Button>
      )}

      {scanError && (
        <Alert color="yellow">
          <Text size="sm">{scanError}</Text>
        </Alert>
      )}

      {!tooManyFiles && figures?.length === 0 && (
        <Text size="xs" c="dimmed" data-testid="pdfua-no-figures">
          {t(
            "convert.pdfUaNoImagesNeedingText",
            "No image is missing a description.",
          )}
        </Text>
      )}

      {!tooManyFiles &&
        figures?.map((figure) => (
          <TextInput
            key={figure.key}
            label={t("convert.pdfUaFigureLabel", "Page {{page}} {{kind}}", {
              page: figure.page,
              kind: figure.kind,
            })}
            placeholder={t(
              "convert.pdfUaFigurePlaceholder",
              "What this image tells the reader",
            )}
            value={descriptions[figure.key] ?? ""}
            onChange={(event) =>
              update({
                altText: formatAltText({
                  ...descriptions,
                  [figure.key]: event.currentTarget.value,
                }),
              })
            }
            disabled={disabled}
            data-testid={`pdfua-alt-text-${figure.key}`}
          />
        ))}
    </Stack>
  );
};

export default ConvertToPdfUaSettings;
