import type { TFunction } from "i18next";
import {
  PdfiumDocument,
  StandardFonts,
  rgb,
  type PdfiumColor,
} from "@editor/services/pdfiumDocBuilder";
import {
  colorPalette,
  statusTextColor as statusText,
} from "@editor/services/reportPdf/reportPalette";
import { wrapText } from "@editor/services/reportPdf/reportText";
import {
  LETTER_PAGE,
  ReportWriter,
  type ReportLayout,
  type TextStyle,
} from "@editor/services/reportPdf/ReportWriter";
import {
  type AccessibilityIssue,
  type AccessibilityReport,
  type AccessibilityReportEntry,
} from "@editor/types/checkAccessibility";
import {
  assessAccessibilityReport,
  type AccessibilityResult,
} from "@editor/utils/accessibilityAssessment";
import {
  categoryLabel,
  describeIssue,
  documentBasics,
  figuresSummary,
  resultLabel,
  resultSummary,
} from "@editor/utils/accessibilityReportContent";

const LAYOUT: ReportLayout = {
  pageWidth: LETTER_PAGE.width,
  pageHeight: LETTER_PAGE.height,
  marginX: 48,
  marginTop: 48,
  marginBottom: 56,
};
const PAGE_WIDTH = LAYOUT.pageWidth;
const PAGE_HEIGHT = LAYOUT.pageHeight;
const MARGIN_X = LAYOUT.marginX;
const MARGIN_TOP = LAYOUT.marginTop;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_RIGHT = MARGIN_X + CONTENT_WIDTH;
const ISSUE_INDENT = 14;
const DETAIL_LABEL_WIDTH = 84;

const resultColor = (result: AccessibilityResult): PdfiumColor =>
  result === "pass"
    ? statusText.success
    : result === "partial"
      ? statusText.warning
      : statusText.danger;

/** `color` laid over white at `amount`, for the soft fills the on-screen chips use. */
const tint = (color: PdfiumColor, amount: number): PdfiumColor =>
  rgb(
    1 - (1 - color._r) * amount,
    1 - (1 - color._g) * amount,
    1 - (1 - color._b) * amount,
  );

function sectionHeading(writer: ReportWriter, title: string, count?: string) {
  writer.ensure(40);
  writer.y -= 14;
  const style: TextStyle = {
    font: writer.boldFont,
    size: 9,
    color: colorPalette.textMuted,
  };
  if (count) writer.textRight(count, MARGIN_X + CONTENT_WIDTH, style);
  writer.text(title.toUpperCase(), MARGIN_X, style);
  writer.rule(writer.y + 2);
  writer.y -= 8;
}

function drawHeader(
  writer: ReportWriter,
  t: TFunction,
  fileName: string,
  subtitle: string | null,
) {
  const nameLines = wrapText(
    fileName,
    writer.boldFont,
    18,
    CONTENT_WIDTH,
  ).slice(0, 2);
  const bandHeight =
    MARGIN_TOP + 16 + nameLines.length * 24.3 + (subtitle ? 13.5 : 0) + 18;
  writer.rect(
    0,
    PAGE_HEIGHT,
    PAGE_WIDTH,
    bandHeight,
    colorPalette.headerBackground,
  );
  writer.text(
    t("checkAccessibility.pdf.title", "Accessibility report"),
    MARGIN_X,
    {
      font: writer.font,
      size: 10,
      color: colorPalette.accent,
    },
  );
  writer.y -= 2;
  for (const line of nameLines) {
    writer.text(line, MARGIN_X, {
      font: writer.boldFont,
      size: 18,
      color: colorPalette.textPrimary,
    });
  }
  if (subtitle) {
    writer.text(subtitle, MARGIN_X, {
      font: writer.font,
      size: 10,
      color: colorPalette.textMuted,
    });
  }
  writer.y = PAGE_HEIGHT - bandHeight - 20;
}

function drawResult(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
  result: AccessibilityResult,
) {
  const height = 70;
  const top = writer.y;
  const color = resultColor(result);
  writer.rect(
    MARGIN_X,
    top,
    CONTENT_WIDTH,
    height,
    colorPalette.boxBackground,
    colorPalette.boxBorder,
  );
  writer.rect(MARGIN_X, top, 4, height, color);
  const textX = MARGIN_X + 20;
  writer.y = top - 12;
  writer.text(resultLabel(t, result), textX, {
    font: writer.boldFont,
    size: 18,
    color,
  });
  writer.text(resultSummary(t, result), textX, {
    font: writer.font,
    size: 10,
    color: colorPalette.textPrimary,
  });
  writer.text(
    report.issues.length === 0
      ? t("checkAccessibility.score.noIssues", "No issues found")
      : t("checkAccessibility.score.issues", "{{count}} issues", {
          count: report.issues.length,
        }),
    textX,
    { font: writer.font, size: 9, color: colorPalette.textMuted },
  );
  writer.y = top - height - 6;
}

/** A soft pill like the on-screen chips; `right` anchors it to the content edge instead. */
function drawPill(
  writer: ReportWriter,
  x: number,
  label: string,
  ok: boolean,
  anchor: "left" | "right" = "left",
) {
  const size = 7.5;
  const width = writer.boldFont.widthOfTextAtSize(label, size) + 12;
  const left = anchor === "right" ? x - width : x;
  const base = ok ? colorPalette.success : colorPalette.danger;
  writer.currentPage.drawRectangle({
    x: left,
    y: writer.y - 11,
    width,
    height: 12,
    color: tint(base, 0.14),
    borderColor: tint(base, 0.55),
    borderWidth: 0.75,
  });
  writer.currentPage.drawText(label, {
    x: left + 6,
    y: writer.y - 8.5,
    size,
    font: writer.boldFont,
    color: ok ? statusText.success : statusText.danger,
  });
  return width;
}

function drawBasics(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
) {
  const basics = documentBasics(t, report);
  const met = basics.filter((fact) => fact.ok).length;
  sectionHeading(
    writer,
    t("checkAccessibility.sections.basics", "Document basics"),
  );
  const pass = t("checkAccessibility.result.pass", "Pass");
  const fail = t("checkAccessibility.result.fail", "Fail");
  const pillWidth =
    Math.max(
      writer.boldFont.widthOfTextAtSize(pass, 7.5),
      writer.boldFont.widthOfTextAtSize(fail, 7.5),
    ) + 12;
  const rows = Math.ceil((basics.length + 1) / 2);
  const rowHeight = 18;
  const columnWidth = CONTENT_WIDTH / 2;
  writer.ensure(rows * rowHeight);
  const top = writer.y;
  basics.forEach((fact, index) => {
    const column = Math.floor(index / rows);
    writer.y = top - (index % rows) * rowHeight;
    const x = MARGIN_X + column * columnWidth;
    drawPill(writer, x, fact.ok ? pass : fail, fact.ok);
    writer.text(fact.label, x + pillWidth + 8, {
      font: writer.font,
      size: 10,
      color: colorPalette.textPrimary,
    });
  });
  const progressX = MARGIN_X + columnWidth;
  const barWidth = columnWidth;
  writer.y = top - (rows - 1) * rowHeight;
  writer.text(
    t("checkAccessibility.basics.met", "{{met}} of {{total}} met", {
      met,
      total: basics.length,
    }),
    progressX,
    { font: writer.font, size: 9, color: colorPalette.textMuted },
  );
  const fraction = met / basics.length;
  writer.rect(progressX, writer.y, barWidth, 3.5, colorPalette.boxBorder);
  writer.rect(
    progressX,
    writer.y,
    barWidth * fraction,
    3.5,
    fraction === 1 ? colorPalette.success : colorPalette.warning,
  );
  writer.y = top - rows * rowHeight;
}

function drawLimits(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
) {
  if (report.humanChecks.length === 0) return;
  sectionHeading(
    writer,
    t("checkAccessibility.sections.limits", "What this tool can't check"),
  );
  const style: TextStyle = {
    font: writer.font,
    size: 10,
    color: colorPalette.textPrimary,
  };
  for (const check of report.humanChecks) {
    const lines = wrapText(check, style.font, style.size, CONTENT_WIDTH - 14);
    lines.forEach((line, lineIndex) => {
      writer.ensure(style.size * 1.35);
      if (lineIndex === 0) {
        writer.currentPage.drawText("•", {
          x: MARGIN_X + 2,
          y: writer.y - style.size,
          size: style.size,
          font: style.font,
          color: colorPalette.textMuted,
        });
      }
      writer.text(line, MARGIN_X + 14, style);
    });
    writer.y -= 3;
  }
}

function drawIssue(
  writer: ReportWriter,
  t: TFunction,
  issue: AccessibilityIssue,
) {
  const x = MARGIN_X + ISSUE_INDENT;
  const width = CONTENT_RIGHT - x;
  const content = describeIssue(t, issue);
  writer.ensure(48);
  writer.paragraph(content.title, x, width, {
    font: writer.boldFont,
    size: 10.5,
    color: colorPalette.textPrimary,
  });
  writer.paragraph(content.summary, x, width, {
    font: writer.font,
    size: 9,
    color: colorPalette.textMuted,
  });
  if (content.explanation) {
    writer.y -= 3;
    writer.paragraph(content.explanation, x, width, {
      font: writer.font,
      size: 9.5,
      color: colorPalette.textPrimary,
    });
  }
  writer.y -= 4;
  const detailStyle: TextStyle = {
    font: writer.font,
    size: 8.5,
    color: colorPalette.textPrimary,
  };
  for (const detail of content.details) {
    const lines = wrapText(
      detail.value,
      writer.font,
      detailStyle.size,
      width - DETAIL_LABEL_WIDTH,
    );
    lines.forEach((line, lineIndex) => {
      writer.ensure(detailStyle.size * 1.35);
      if (lineIndex === 0) {
        writer.currentPage.drawText(detail.label, {
          x,
          y: writer.y - detailStyle.size,
          size: detailStyle.size,
          font: writer.font,
          color: colorPalette.textMuted,
        });
      }
      writer.text(line, x + DETAIL_LABEL_WIDTH, detailStyle);
    });
  }
  writer.y -= 6;
}

function drawBreakdown(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
) {
  sectionHeading(
    writer,
    t("checkAccessibility.sections.breakdown", "Breakdown"),
  );
  const { areas } = assessAccessibilityReport(report);
  const figures = figuresSummary(t, report);
  areas.forEach((area, areaIndex) => {
    const passes = area.issues.length === 0;
    const note = area.id === "altText" ? figures : null;
    writer.ensure(passes && !note ? 20 : 68);
    if (areaIndex > 0) {
      writer.rule(writer.y + 4);
      writer.y -= 4;
    }
    drawPill(
      writer,
      CONTENT_RIGHT,
      passes
        ? t("checkAccessibility.result.pass", "Pass")
        : t("checkAccessibility.result.fail", "Fail"),
      passes,
      "right",
    );
    writer.text(categoryLabel(t, area.id), MARGIN_X, {
      font: writer.boldFont,
      size: 10.5,
      color: colorPalette.textPrimary,
    });
    writer.y -= 4;
    area.issues.forEach((issue, index) => {
      if (index > 0) {
        writer.ensure(10);
        writer.currentPage.drawLine({
          start: { x: MARGIN_X + ISSUE_INDENT, y: writer.y + 3 },
          end: { x: CONTENT_RIGHT, y: writer.y + 3 },
          thickness: 0.5,
          color: colorPalette.boxBorder,
        });
        writer.y -= 4;
      }
      drawIssue(writer, t, issue);
    });
    if (note) {
      writer.paragraph(
        note,
        MARGIN_X + ISSUE_INDENT,
        CONTENT_RIGHT - MARGIN_X - ISSUE_INDENT,
        {
          font: writer.font,
          size: 9,
          color: colorPalette.textMuted,
        },
      );
      writer.y -= 4;
    }
    writer.y -= 4;
  });
}

function drawFailedEntry(
  writer: ReportWriter,
  t: TFunction,
  entry: AccessibilityReportEntry,
) {
  writer.paragraph(
    t("checkAccessibility.error.fileTitle", "This file could not be checked"),
    MARGIN_X,
    CONTENT_WIDTH,
    {
      font: writer.boldFont,
      size: 12,
      color: statusText.danger,
    },
  );
  if (entry.error) {
    writer.paragraph(entry.error, MARGIN_X, CONTENT_WIDTH, {
      font: writer.font,
      size: 10,
      color: colorPalette.textPrimary,
    });
  }
}

/** "Report.pdf" -> "Report-accessibility-report.pdf". */
export function accessibilityReportPdfName(fileName: string): string {
  return `${fileName.replace(/\.pdf$/i, "")}-accessibility-report.pdf`;
}

/**
 * One file's on-screen report as a PDF. Text is set in the standard Helvetica fonts, so
 * characters outside WinAnsi do not render.
 */
export async function createAccessibilityReportPdf(
  entry: AccessibilityReportEntry,
  t: TFunction,
): Promise<File> {
  const doc = await PdfiumDocument.create();
  const writer = new ReportWriter(doc, {
    layout: LAYOUT,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    footerText: t("checkAccessibility.pdf.footer", "Checked with Stirling PDF"),
    pageLabel: (n) => t("checkAccessibility.pdf.page", "Page {{n}}", { n }),
  });

  writer.startSection(
    t("checkAccessibility.pdf.continued", "{{name}} (continued)", {
      name: entry.fileName,
    }),
  );
  const report = entry.report;
  drawHeader(
    writer,
    t,
    entry.fileName,
    report
      ? t(
          "checkAccessibility.score.subtitle",
          "{{profile}} · {{count}} pages",
          {
            profile: report.profile,
            count: report.summary.pages,
          },
        )
      : null,
  );
  if (report) {
    drawResult(writer, t, report, assessAccessibilityReport(report).result);
    drawBasics(writer, t, report);
    drawLimits(writer, t, report);
    drawBreakdown(writer, t, report);
  } else {
    drawFailedEntry(writer, t, entry);
  }

  const bytes = await doc.save();
  return new File(
    [bytes.slice().buffer],
    accessibilityReportPdfName(entry.fileName),
    {
      type: "application/pdf",
    },
  );
}
