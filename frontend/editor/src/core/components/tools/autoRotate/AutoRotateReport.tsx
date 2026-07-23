import { Stack, Text, Table, Badge, ScrollArea } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AutoRotateReport as ReportData,
  AutoRotatePageResult,
} from "@app/hooks/tools/autoRotate/useAutoRotateOperation";

interface AutoRotateReportProps {
  reports: { fileName: string; report: ReportData }[];
}

const methodBadge = (t: TFunction, method: AutoRotatePageResult["method"]) => {
  switch (method) {
    case "text":
      return (
        <Badge size="sm" variant="light" color="blue">
          {t("autoRotate.report.method.text", "Text")}
        </Badge>
      );
    case "osd":
      return (
        <Badge size="sm" variant="light" color="teal">
          {t("autoRotate.report.method.osd", "OCR")}
        </Badge>
      );
    default:
      return (
        <Badge size="sm" variant="light" color="gray">
          {t("autoRotate.report.method.none", "Skipped")}
        </Badge>
      );
  }
};

const noteLabel = (t: TFunction, note: string | null | undefined): string => {
  switch (note) {
    case "tooFewGlyphs":
      return t("autoRotate.report.note.tooFewGlyphs", "Too little text");
    case "noDominantDirection":
      return t(
        "autoRotate.report.note.noDominantDirection",
        "Mixed text directions",
      );
    case "tesseractUnavailable":
      return t(
        "autoRotate.report.note.tesseractUnavailable",
        "OCR not installed",
      );
    case "osdFailed":
      return t("autoRotate.report.note.osdFailed", "No readable text found");
    case "osdNoVerdict":
      return t("autoRotate.report.note.osdNoVerdict", "OCR gave no verdict");
    case "belowThreshold":
      return t(
        "autoRotate.report.note.belowThreshold",
        "Below confidence threshold",
      );
    default:
      return note ?? "";
  }
};

// Text confidence is a glyph-dominance percentage; OSD confidence is
// Tesseract's unbounded score. Label them differently so the numbers are
// interpretable when tuning the threshold.
const confidenceLabel = (page: AutoRotatePageResult): string => {
  if (page.confidence == null) return "—";
  return page.method === "text"
    ? `${page.confidence.toFixed(1)}%`
    : page.confidence.toFixed(2);
};

const AutoRotateReport = ({ reports }: AutoRotateReportProps) => {
  const { t } = useTranslation();

  if (reports.length === 0) return null;

  return (
    <Stack gap="md">
      {reports.map(({ fileName, report }) => (
        <Stack gap="xs" key={fileName}>
          {reports.length > 1 && (
            <Text size="sm" fw={500} truncate>
              {fileName}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {t("autoRotate.report.summary", {
              defaultValue:
                "{{rotated}} of {{total}} pages rotated ({{text}} by text, {{osd}} by OCR, {{undetected}} undetected)",
              rotated: report.pagesToRotate,
              total: report.totalPages,
              text: report.detectedByText,
              osd: report.detectedByOsd,
              undetected: report.undetected,
            })}
          </Text>
          <ScrollArea.Autosize mah={320}>
            <Table
              striped
              highlightOnHover
              withTableBorder
              verticalSpacing="xs"
              fz="xs"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("autoRotate.report.page", "Page")}</Table.Th>
                  <Table.Th>
                    {t("autoRotate.report.methodHeader", "Method")}
                  </Table.Th>
                  <Table.Th>
                    {t("autoRotate.report.confidence", "Confidence")}
                  </Table.Th>
                  <Table.Th>
                    {t("autoRotate.report.rotation", "Rotation")}
                  </Table.Th>
                  <Table.Th>
                    {t("autoRotate.report.noteHeader", "Note")}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.pages.map((page) => (
                  <Table.Tr key={page.pageNumber}>
                    <Table.Td>{page.pageNumber}</Table.Td>
                    <Table.Td>{methodBadge(t, page.method)}</Table.Td>
                    <Table.Td>{confidenceLabel(page)}</Table.Td>
                    <Table.Td>
                      {page.apply
                        ? t("autoRotate.report.applied", {
                            defaultValue: "{{degrees}}° CW",
                            degrees: page.correction,
                          })
                        : "—"}
                    </Table.Td>
                    <Table.Td>{noteLabel(t, page.note)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        </Stack>
      ))}
    </Stack>
  );
};

export default AutoRotateReport;
