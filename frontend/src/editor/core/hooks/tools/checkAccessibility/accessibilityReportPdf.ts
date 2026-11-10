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
  type AccessibilityReport,
  type AccessibilityReportEntry,
} from "@editor/types/checkAccessibility";
import {
  scoreAccessibilityReport,
  type AccessibilityGrade,
} from "@editor/utils/accessibilityScore";
import {
  categoryLabel,
  describeIssue,
  documentBasics,
  figuresSummary,
  gradeLabel,
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
const DETAIL_LABEL_WIDTH = 84;
const WHITE = rgb(1, 1, 1);

const gradeColor = (grade: AccessibilityGrade): PdfiumColor =>
  grade === "poor"
    ? statusText.danger
    : grade === "needsWork"
      ? statusText.warning
      : statusText.success;

const barColor = (fraction: number): PdfiumColor =>
  fraction >= 0.999
    ? colorPalette.success
    : fraction >= 0.5
      ? colorPalette.warning
      : colorPalette.danger;

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

function drawScore(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
) {
  const scored = scoreAccessibilityReport(report);
  const cardHeight = report.tagged ? 64 : 78;
  const top = writer.y;
  writer.rect(
    MARGIN_X,
    top,
    CONTENT_WIDTH,
    cardHeight,
    colorPalette.boxBackground,
    colorPalette.boxBorder,
  );

  const scoreText = String(scored.score);
  const scoreSize = 34;
  const scoreX = MARGIN_X + 18;
  writer.y = top - 14;
  writer.text(scoreText, scoreX, {
    font: writer.boldFont,
    size: scoreSize,
    color: gradeColor(scored.grade),
  });
  writer.y = top - 14 - scoreSize + 10;
  writer.text(
    "/100",
    scoreX + writer.boldFont.widthOfTextAtSize(scoreText, scoreSize) + 3,
    {
      font: writer.font,
      size: 10,
      color: colorPalette.textMuted,
    },
  );

  const textX = MARGIN_X + 120;
  writer.y = top - 14;
  writer.text(gradeLabel(t, scored.grade), textX, {
    font: writer.boldFont,
    size: 14,
    color: gradeColor(scored.grade),
  });
  writer.text(
    report.issues.length === 0
      ? t("checkAccessibility.score.noIssues", "No issues found")
      : t("checkAccessibility.score.issues", "{{count}} issues", {
          count: report.issues.length,
        }),
    textX,
    { font: writer.font, size: 10, color: colorPalette.textPrimary },
  );
  if (!report.tagged) {
    writer.text(
      t(
        "checkAccessibility.score.untaggedTip",
        "Screen readers can't follow an untagged PDF, so its score is halved.",
      ),
      textX,
      { font: writer.font, size: 9, color: statusText.danger },
    );
  }
  writer.y = top - cardHeight - 4;
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
  const scored = scoreAccessibilityReport(report);
  for (const category of scored.categories) {
    writer.ensure(26);
    const failed = category.issues.length;
    const value =
      category.rulesInProfile !== undefined
        ? `${Math.max(0, category.rulesInProfile - failed)}/${category.rulesInProfile}`
        : t("checkAccessibility.breakdown.failingCount", "{{count}} failing", {
            count: failed,
          });
    const label: TextStyle = {
      font: writer.font,
      size: 10,
      color: colorPalette.textPrimary,
    };
    writer.textRight(value, MARGIN_X + CONTENT_WIDTH, {
      ...label,
      color: colorPalette.textMuted,
    });
    writer.text(categoryLabel(t, category.id), MARGIN_X, label);
    const fraction = category.points / category.weight;
    const barTop = writer.y + 1;
    writer.rect(MARGIN_X, barTop, CONTENT_WIDTH, 3.5, colorPalette.boxBorder);
    if (fraction > 0) {
      writer.rect(
        MARGIN_X,
        barTop,
        CONTENT_WIDTH * fraction,
        3.5,
        barColor(fraction),
      );
    }
    writer.y -= 10;
  }
}

function drawIssues(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
) {
  const scored = scoreAccessibilityReport(report);
  for (const category of scored.categories) {
    if (category.issues.length === 0) continue;
    sectionHeading(
      writer,
      categoryLabel(t, category.id),
      String(category.issues.length),
    );
    category.issues.forEach((issue, index) => {
      const content = describeIssue(t, issue);
      if (index > 0) {
        writer.ensure(12);
        writer.rule(writer.y + 4);
        writer.y -= 6;
      }
      writer.ensure(48);
      writer.paragraph(content.title, MARGIN_X, CONTENT_WIDTH, {
        font: writer.boldFont,
        size: 11,
        color: colorPalette.textPrimary,
      });
      writer.paragraph(content.summary, MARGIN_X, CONTENT_WIDTH, {
        font: writer.font,
        size: 9,
        color: colorPalette.textMuted,
      });
      if (content.explanation) {
        writer.y -= 3;
        writer.paragraph(content.explanation, MARGIN_X, CONTENT_WIDTH, {
          font: writer.font,
          size: 10,
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
          CONTENT_WIDTH - DETAIL_LABEL_WIDTH,
        );
        lines.forEach((line, lineIndex) => {
          writer.ensure(detailStyle.size * 1.35);
          if (lineIndex === 0) {
            writer.currentPage.drawText(detail.label, {
              x: MARGIN_X,
              y: writer.y - detailStyle.size,
              size: detailStyle.size,
              font: writer.font,
              color: colorPalette.textMuted,
            });
          }
          writer.text(line, MARGIN_X + DETAIL_LABEL_WIDTH, detailStyle);
        });
      }
      writer.y -= 4;
    });
  }

  const figures = figuresSummary(t, report);
  if (figures) {
    writer.y -= 8;
    writer.paragraph(figures, MARGIN_X, CONTENT_WIDTH, {
      font: writer.font,
      size: 10,
      color: colorPalette.textMuted,
    });
  }
}

function drawStatusPill(
  writer: ReportWriter,
  x: number,
  label: string,
  color: PdfiumColor,
) {
  const size = 7;
  const width = writer.boldFont.widthOfTextAtSize(label, size) + 10;
  writer.rect(x, writer.y + 1, width, 12, color);
  writer.currentPage.drawText(label, {
    x: x + 5,
    y: writer.y - 8,
    size,
    font: writer.boldFont,
    color: WHITE,
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
    `${met}/${basics.length}`,
  );
  const pass = t("checkAccessibility.pdf.pass", "Pass");
  const fail = t("checkAccessibility.pdf.fail", "Fail");
  const pillWidth =
    Math.max(
      writer.boldFont.widthOfTextAtSize(pass, 7),
      writer.boldFont.widthOfTextAtSize(fail, 7),
    ) + 10;
  const columnWidth = CONTENT_WIDTH / 2;
  for (let index = 0; index < basics.length; index += 2) {
    writer.ensure(18);
    const rowTop = writer.y;
    basics.slice(index, index + 2).forEach((fact, column) => {
      writer.y = rowTop;
      const x = MARGIN_X + column * columnWidth;
      drawStatusPill(
        writer,
        x,
        fact.ok ? pass : fail,
        fact.ok ? statusText.success : statusText.danger,
      );
      writer.text(fact.label, x + pillWidth + 8, {
        font: writer.font,
        size: 10,
        color: colorPalette.textPrimary,
      });
    });
    writer.y = rowTop - 18;
  }
}

function drawManualChecks(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
) {
  if (report.humanChecks.length === 0) return;
  sectionHeading(
    writer,
    t("checkAccessibility.sections.manual", "Manual checks"),
    String(report.humanChecks.length),
  );
  writer.paragraph(
    t(
      "checkAccessibility.manual.tip",
      "Automated checks cover only part of PDF/UA. These need a person.",
    ),
    MARGIN_X,
    CONTENT_WIDTH,
    { font: writer.font, size: 9, color: colorPalette.textMuted },
  );
  writer.y -= 4;
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
    drawScore(writer, t, report);
    drawBreakdown(writer, t, report);
    drawIssues(writer, t, report);
    drawBasics(writer, t, report);
    drawManualChecks(writer, t, report);
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
