import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  SegmentedControl,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { SignatureValidationReportEntry } from "@app/types/validateSignature";
import type { ValidateSignatureOperationHook } from "@app/hooks/tools/validateSignature/useValidateSignatureOperation";
import "@app/components/tools/validateSignature/reportView/styles.css";
import type { TFunction } from "i18next";
import FitText from "@app/components/shared/FitText";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import { downloadFile } from "@app/services/downloadService";
import {
  computeSignatureStatus,
  type SignatureStatusKind,
} from "@app/hooks/tools/validateSignature/utils/signatureStatus";

// Worst trust-aware status across a file's signatures - keeps the summary badge
// consistent with the per-signature badges in the report (valid vs unverified vs invalid).
const fileStatusKind = (
  result: SignatureValidationReportEntry,
  t: TFunction<"translation">,
): SignatureStatusKind => {
  if (result.error) return "invalid";
  if (result.signatures.length === 0) return "neutral";
  const kinds = result.signatures.map((s) => computeSignatureStatus(s, t).kind);
  if (kinds.includes("invalid")) return "invalid";
  if (kinds.includes("warning")) return "warning";
  return "valid";
};

interface ValidateSignatureResultsProps {
  operation: ValidateSignatureOperationHook;
  results: SignatureValidationReportEntry[];
  isLoading: boolean;
  errorMessage: string | null;
  reportAvailable?: boolean;
}

const useFileSummary = (
  results: SignatureValidationReportEntry[],
  t: TFunction<"translation">,
) => {
  return useMemo(() => {
    let signatureCount = 0;
    let validCount = 0;
    let warningCount = 0;
    let invalidCount = 0;

    results.forEach((result) => {
      signatureCount += result.signatures.length;
      result.signatures.forEach((signature) => {
        const kind = computeSignatureStatus(signature, t).kind;
        if (kind === "valid") validCount += 1;
        else if (kind === "warning") warningCount += 1;
        else if (kind === "invalid") invalidCount += 1;
      });
    });

    return {
      fileCount: results.length,
      signatureCount,
      validCount,
      warningCount,
      invalidCount,
    };
  }, [results, t]);
};

const findFileByExtension = (files: File[], extension: string) => {
  return files.find((file) => file.name.toLowerCase().endsWith(extension));
};

const ValidateSignatureResults = ({
  operation,
  results,
  isLoading,
  errorMessage,
}: ValidateSignatureResultsProps) => {
  const { t } = useTranslation();
  const summary = useFileSummary(results, t);

  const pdfFile = useMemo(
    () => findFileByExtension(operation.files, ".pdf"),
    [operation.files],
  );
  const csvFile = useMemo(
    () => findFileByExtension(operation.files, ".csv"),
    [operation.files],
  );
  const jsonFile = useMemo(
    () => findFileByExtension(operation.files, ".json"),
    [operation.files],
  );

  const [selectedType, setSelectedType] = useState<"pdf" | "csv" | "json">(
    "pdf",
  );

  const selectedFile = useMemo(() => {
    if (selectedType === "pdf") return pdfFile ?? null;
    if (selectedType === "csv") return csvFile ?? null;
    return jsonFile ?? null;
  }, [selectedType, pdfFile, csvFile, jsonFile]);

  const selectedDownloadLabel = useMemo(() => {
    if (selectedType === "pdf")
      return t("validateSignature.downloadPdf", "Download PDF Report");
    if (selectedType === "csv")
      return t("validateSignature.downloadCsv", "Download CSV");
    return t("validateSignature.downloadJson", "Download JSON");
  }, [selectedType, t]);

  const downloadTypeOptions = [
    { label: t("validateSignature.downloadType.pdf", "PDF"), value: "pdf" },
    { label: t("validateSignature.downloadType.csv", "CSV"), value: "csv" },
    { label: t("validateSignature.downloadType.json", "JSON"), value: "json" },
  ];

  const handleDownload = useCallback((file: File) => {
    void downloadFile({ data: file, filename: file.name });
  }, []);

  // Show the big loader only while we're still waiting for the first results.
  if (isLoading && results.length === 0) {
    return (
      <Group justify="center" gap="sm" py="md">
        <Loader size="sm" />
        <Text>
          {t("validateSignature.processing", "Validating signatures...")}
        </Text>
      </Group>
    );
  }

  if (!isLoading && results.length === 0) {
    return (
      <Alert
        color="gray"
        variant="light"
        title={t("validateSignature.results", "Validation Results")}
      >
        <Text size="sm">
          {t(
            "validateSignature.noResults",
            "Run the validation to generate a report.",
          )}
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* While results are visible but background work continues (e.g. generating files),
          show a light inline indicator without blocking downloads UI. */}
      {isLoading && results.length > 0 && (
        <Group justify="center" gap="xs">
          <Loader size="xs" />
          <Text size="sm">
            {t("validateSignature.finalizing", "Preparing downloads...")}
          </Text>
        </Group>
      )}
      {errorMessage && (
        <Alert color="yellow" variant="light">
          <Text size="sm">{errorMessage}</Text>
        </Alert>
      )}

      <Group gap="sm">
        <Badge color="blue" variant="light">
          {t(
            "validateSignature.report.filesEvaluated",
            "{{count}} files evaluated",
            {
              count: summary.fileCount,
            },
          )}
        </Badge>
        <Badge color="teal" variant="light">
          {t(
            "validateSignature.report.signaturesFound",
            "{{count}} signatures detected",
            {
              count: summary.signatureCount,
            },
          )}
        </Badge>
        {summary.validCount > 0 && (
          <Badge color="green" variant="light">
            {t(
              "validateSignature.report.signaturesValid",
              "{{count}} fully valid",
              { count: summary.validCount },
            )}
          </Badge>
        )}
        {summary.warningCount > 0 && (
          <Badge color="yellow" variant="light">
            {t(
              "validateSignature.report.signaturesUnverified",
              "{{count}} need review",
              { count: summary.warningCount },
            )}
          </Badge>
        )}
        {summary.invalidCount > 0 && (
          <Badge color="red" variant="light">
            {t(
              "validateSignature.report.signaturesInvalid",
              "{{count}} invalid",
              { count: summary.invalidCount },
            )}
          </Badge>
        )}
      </Group>

      <Stack gap="sm" style={{ maxHeight: "20rem", overflowY: "auto" }}>
        {results.map((result) => {
          const kind = fileStatusKind(result, t);
          const badgeLabel =
            kind === "invalid"
              ? t("validateSignature.status.invalid", "Invalid")
              : kind === "warning"
                ? t("validateSignature.status.untrustedShort", "Unverified")
                : kind === "valid"
                  ? t("validateSignature.status.valid", "Valid")
                  : t("validateSignature.noSignaturesShort", "No signatures");
          const badgeClass = `status-badge status-badge--${kind}`;

          return (
            <Stack
              key={result.fileId}
              gap={4}
              p="xs"
              style={{ borderLeft: "2px solid var(--mantine-color-gray-4)" }}
            >
              <Group justify="space-between" align="flex-start">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FitText
                    text={result.fileName}
                    lines={2}
                    as="div"
                    minimumFontScale={0.5}
                    style={{ fontWeight: 600 }}
                  />
                </div>
                <Badge className={badgeClass} variant="light">
                  {badgeLabel}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {t(
                  "validateSignature.report.signatureCountLabel",
                  "{{count}} signatures",
                  {
                    count: result.signatures.length,
                  },
                )}
              </Text>
              {!result.error && result.signatures.length === 0 && (
                <Text size="xs" c="dimmed">
                  {t(
                    "validateSignature.noSignatures",
                    "No digital signatures found in this document",
                  )}
                </Text>
              )}
            </Stack>
          );
        })}
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t("validateSignature.report.downloads", "Downloads")}
        </Text>
        <SegmentedControl
          value={selectedType}
          onChange={(v) => setSelectedType(v as "pdf" | "csv" | "json")}
          data={downloadTypeOptions}
        />
        <Button
          color="blue"
          onClick={() => selectedFile && handleDownload(selectedFile)}
          disabled={!selectedFile}
          fullWidth
        >
          {selectedDownloadLabel}
        </Button>
        {selectedType === "pdf" && !pdfFile && (
          <Text size="xs" c="dimmed">
            {t(
              "validateSignature.report.noPdf",
              "PDF report will be available after a successful validation.",
            )}
          </Text>
        )}
      </Stack>

      <SuggestedToolsSection />
    </Stack>
  );
};

export default ValidateSignatureResults;
