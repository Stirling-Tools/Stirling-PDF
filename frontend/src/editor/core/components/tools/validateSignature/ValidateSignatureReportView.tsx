import React, { useMemo } from "react";
import { Badge, Group, Stack, Text, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  SignatureValidationReportData,
  SignatureValidationReportEntry,
} from "@app/types/validateSignature";
import "@app/components/tools/validateSignature/reportView/styles.css";
import ThumbnailPreview from "@app/components/tools/validateSignature/reportView/ThumbnailPreview";
import FileSummaryHeader from "@app/components/tools/validateSignature/reportView/FileSummaryHeader";
import SignatureSection from "@app/components/tools/validateSignature/reportView/SignatureSection";

interface ValidateSignatureReportViewProps {
  data: SignatureValidationReportData;
}

interface ReportPageDef {
  entry: SignatureValidationReportEntry;
  signatureIndex: number | null;
  includeSummary: boolean;
}

const NoSignatureSection = ({
  message,
  label,
}: {
  message: string;
  label: string;
}) => (
  <Stack
    align="center"
    justify="center"
    gap="xs"
    style={{ minHeight: 360, width: "100%" }}
  >
    <Badge
      color="gray"
      variant="light"
      size="lg"
      style={{ textTransform: "uppercase" }}
    >
      {label}
    </Badge>
    <Text size="sm" c="dimmed" style={{ textAlign: "center" }}>
      {message}
    </Text>
  </Stack>
);

const ReportHeader = ({ generatedAt }: { generatedAt: number }) => {
  const { t } = useTranslation();
  return (
    <Stack gap="xs" align="center">
      <Badge size="lg" color="blue" variant="light">
        {t("validateSignature.report.title", "Signature Validation Report")}
      </Badge>
      <Text size="sm" c="dimmed">
        {t("validateSignature.report.generatedAt", "Generated")}{" "}
        {new Date(generatedAt).toLocaleString()}
      </Text>
    </Stack>
  );
};

const PageSummary = ({
  page,
  pageNumber,
}: {
  page: ReportPageDef;
  pageNumber: number;
}) => {
  const { t } = useTranslation();
  if (!page.includeSummary) return null;
  const { entry } = page;
  return (
    <>
      <Group align="flex-start" gap="lg">
        <ThumbnailPreview
          thumbnailUrl={entry.thumbnailUrl}
          fileName={entry.fileName}
        />
        <Stack gap="sm" style={{ flex: 1 }}>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={700} size="xl" style={{ lineHeight: 1.1 }}>
                {entry.fileName}
              </Text>
              <Text size="sm" c="dimmed">
                {t("validateSignature.report.entryLabel", "Signature Summary")}
              </Text>
            </div>
            <Badge color="gray" variant="light">
              {t("validateSignature.report.page", "Page")} {pageNumber}
            </Badge>
          </Group>

          <FileSummaryHeader
            fileSize={entry.fileSize}
            createdAt={entry.createdAtLabel ?? null}
            totalSignatures={entry.signatures.length}
            lastSignatureDate={entry.signatures[0]?.signatureDate}
          />
        </Stack>
      </Group>

      <Divider />
    </>
  );
};

const PageSignature = ({ page }: { page: ReportPageDef }) => {
  const { t } = useTranslation();
  const { entry, signatureIndex } = page;
  if (entry.error) {
    return (
      <NoSignatureSection
        message={entry.error}
        label={t("validateSignature.status.invalid", "Invalid")}
      />
    );
  }
  if (signatureIndex === null) {
    return (
      <NoSignatureSection
        message={t(
          "validateSignature.noSignatures",
          "No digital signatures found in this document",
        )}
        label={t("validateSignature.noSignaturesShort", "No signatures")}
      />
    );
  }
  return (
    <Stack gap="xl">
      <SignatureSection
        signature={entry.signatures[signatureIndex]}
        index={signatureIndex}
      />
    </Stack>
  );
};

const PageFooter = ({
  pageNumber,
  pageCount,
}: {
  pageNumber: number;
  pageCount: number;
}) => {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" align="center" mt="auto" pt="md">
      <Text size="xs" c="dimmed">
        {t("validateSignature.report.footer", "Validated via Stirling PDF")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("validateSignature.report.page", "Page")} {pageNumber} / {pageCount}
      </Text>
    </Group>
  );
};

const ReportPage = ({
  page,
  pageNumber,
  pageCount,
}: {
  page: ReportPageDef;
  pageNumber: number;
  pageCount: number;
}) => (
  <div className="simulated-page">
    <Stack gap="lg" style={{ flex: 1 }}>
      <PageSummary page={page} pageNumber={pageNumber} />
      <PageSignature page={page} />
    </Stack>
    <PageFooter pageNumber={pageNumber} pageCount={pageCount} />
  </div>
);

const ValidateSignatureReportView: React.FC<
  ValidateSignatureReportViewProps
> = ({ data }) => {
  const pages = useMemo(() => {
    const result: ReportPageDef[] = [];

    for (const entry of data.entries) {
      if (entry.signatures.length === 0 || entry.error) {
        result.push({ entry, signatureIndex: null, includeSummary: true });
        continue;
      }

      // First page includes summary and the first signature
      result.push({ entry, signatureIndex: 0, includeSummary: true });

      // Subsequent signatures each get their own page
      for (let i = 1; i < entry.signatures.length; i += 1) {
        result.push({ entry, signatureIndex: i, includeSummary: false });
      }
    }

    return result;
  }, [data.entries]);

  return (
    <div className="report-container">
      <Stack gap="xl" align="center">
        <ReportHeader generatedAt={data.generatedAt} />

        {pages.map((page, index) => (
          <ReportPage
            key={`${page.entry.fileId}-${index}`}
            page={page}
            pageNumber={index + 1}
            pageCount={pages.length}
          />
        ))}
      </Stack>
    </div>
  );
};

export default ValidateSignatureReportView;
