import {
  Stack,
  Text,
  Badge,
  ScrollArea,
  Group,
  Divider,
  Box,
} from "@mantine/core";
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
    case "inferred":
      return (
        <Badge size="sm" variant="light" color="grape">
          {t("autoRotate.report.method.inferred", "Matched")}
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
      return t(
        "autoRotate.report.note.osdNoVerdict",
        "Could not tell which way up",
      );
    case "belowThreshold":
      return t("autoRotate.report.note.belowThreshold", "Below threshold");
    case "inferredFromDocument":
      return t(
        "autoRotate.report.note.inferredFromDocument",
        "Same as the other pages",
      );
    default:
      return note ?? "";
  }
};

// Text confidence is a glyph-dominance percentage; OCR confidence is an
// unbounded score. Format them differently so the numbers stay interpretable
// when tuning the threshold.
const confidenceValue = (page: AutoRotatePageResult): string | null => {
  if (page.confidence == null) return null;
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
                "{{rotated}} of {{total}} pages rotated, {{unchanged}} left as they are",
              rotated: report.pagesToRotate,
              total: report.totalPages,
              unchanged: report.totalPages - report.pagesToRotate,
            })}
          </Text>

          {/* A per-page list rather than a table: the tool panel is too narrow
              for five columns, which truncated the badges and wrapped notes. */}
          <ScrollArea.Autosize mah={300}>
            <Stack gap={0}>
              {report.pages.map((page, index) => {
                const confidence = confidenceValue(page);
                const note = noteLabel(t, page.note);
                return (
                  <Box key={page.pageNumber}>
                    {index > 0 && <Divider />}
                    <Stack gap={2} py={6}>
                      <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Text size="sm" fw={500}>
                          {t("autoRotate.report.pageLabel", {
                            defaultValue: "Page {{number}}",
                            number: page.pageNumber,
                          })}
                        </Text>
                        <Text
                          size="sm"
                          fw={page.apply ? 600 : 400}
                          c={page.apply ? undefined : "dimmed"}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {page.apply
                            ? t("autoRotate.report.applied", {
                                defaultValue: "{{degrees}}° CW",
                                degrees: page.correction,
                              })
                            : t("autoRotate.report.noChange", "No change")}
                        </Text>
                      </Group>
                      {/* Second line mirrors the first: detail under the page
                          number, method badge under the rotation. */}
                      <Group
                        justify="space-between"
                        gap="xs"
                        wrap="nowrap"
                        align="flex-start"
                      >
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {[
                            confidence &&
                              t("autoRotate.report.confidenceValue", {
                                defaultValue: "Confidence {{value}}",
                                value: confidence,
                              }),
                            note,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        <Box style={{ flexShrink: 0 }}>
                          {methodBadge(t, page.method)}
                        </Box>
                      </Group>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      ))}
    </Stack>
  );
};

export default AutoRotateReport;
