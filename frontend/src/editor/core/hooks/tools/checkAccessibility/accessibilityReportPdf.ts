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
  type AccessibilityAssessment,
  type AccessibilityResult,
} from "@editor/utils/accessibilityAssessment";
import {
  basicLabel,
  categoryLabel,
  describeIssue,
  figuresSummary,
  resultLabel,
  resultSummary,
} from "@editor/utils/accessibilityReportContent";

/**
 * Lays out one file's report on US Letter. Every size is in PDF points: the type scale and the
 * spacing below set the whole layout, and the rest is derived from them.
 */
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
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_RIGHT = MARGIN_X + CONTENT_WIDTH;

const TYPE = {
  heading: 9,
  fileName: 18,
  result: 18,
  body: 10,
  rowLabel: 10.5,
  explanation: 9.5,
  meta: 9,
  detail: 8.5,
  pill: 7.5,
  ringNumber: 16,
  ringOutOf: 8,
} as const;

const SPACE = { xxs: 2, xs: 3, sm: 4, md: 8, lg: 14, xl: 20 } as const;

// Must match ReportWriter's line height, which moves y by this much per line it draws.
const lineHeight = (size: number) => size * 1.35;

const INDENT = 14;
const DETAIL_LABEL_WIDTH = 84;
const HEADER_BOTTOM_PADDING = 18;
const RESULT_CARD_HEIGHT = 84;
const RESULT_CARD_INSET = 18;
const RING = { radius: 25, stroke: 6, segments: 120 } as const;
const PILL = { height: 12, padding: 6, tint: 0.14, borderTint: 0.55 } as const;
const CHECKBOX = { size: 8, border: 0.75 } as const;

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

/** Height a section heading needs with at least one row under it, so it never ends a page. */
const SECTION_HEADING_KEEP = 40;

function sectionHeading(writer: ReportWriter, title: string, count?: string) {
  writer.ensure(SECTION_HEADING_KEEP);
  writer.y -= SPACE.lg;
  const style: TextStyle = {
    font: writer.boldFont,
    size: TYPE.heading,
    color: colorPalette.textMuted,
  };
  if (count) writer.textRight(count, CONTENT_RIGHT, style);
  writer.text(title.toUpperCase(), MARGIN_X, style);
  writer.rule(writer.y + SPACE.xxs);
  writer.y -= SPACE.md;
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
    TYPE.fileName,
    CONTENT_WIDTH,
  ).slice(0, 2);
  const bandHeight =
    LAYOUT.marginTop +
    lineHeight(TYPE.body) +
    SPACE.xxs +
    nameLines.length * lineHeight(TYPE.fileName) +
    (subtitle ? lineHeight(TYPE.body) : 0) +
    HEADER_BOTTOM_PADDING;
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
    { font: writer.font, size: TYPE.body, color: colorPalette.accent },
  );
  writer.y -= SPACE.xxs;
  for (const line of nameLines) {
    writer.text(line, MARGIN_X, {
      font: writer.boldFont,
      size: TYPE.fileName,
      color: colorPalette.textPrimary,
    });
  }
  if (subtitle) {
    writer.text(subtitle, MARGIN_X, {
      font: writer.font,
      size: TYPE.body,
      color: colorPalette.textMuted,
    });
  }
  writer.y = PAGE_HEIGHT - bandHeight - SPACE.xl;
}

/** An arc clockwise from 12 o'clock, drawn as short overlapping strokes. */
function drawArc(
  writer: ReportWriter,
  cx: number,
  cy: number,
  fraction: number,
  color: PdfiumColor,
) {
  const segments = Math.ceil(RING.segments * fraction);
  const step = (2 * Math.PI * fraction) / segments;
  // Overlap neighbours so their square ends leave no gaps on the outside of the curve.
  const overlap = step * 0.25;
  const point = (angle: number) => ({
    x: cx + RING.radius * Math.sin(angle),
    y: cy + RING.radius * Math.cos(angle),
  });
  for (let index = 0; index < segments; index++) {
    writer.currentPage.drawLine({
      start: point(Math.max(0, index * step - overlap)),
      end: point((index + 1) * step),
      thickness: RING.stroke,
      color,
    });
  }
}

function drawChecksRing(
  writer: ReportWriter,
  cx: number,
  cy: number,
  assessment: AccessibilityAssessment,
) {
  const { passed, total } = assessment.checks;
  drawArc(writer, cx, cy, 1, colorPalette.boxBorder);
  if (passed > 0) {
    drawArc(writer, cx, cy, passed / total, resultColor(assessment.result));
  }
  const number = String(passed);
  const outOf = `/${total}`;
  const numberWidth = writer.boldFont.widthOfTextAtSize(
    number,
    TYPE.ringNumber,
  );
  const width =
    numberWidth + 1 + writer.font.widthOfTextAtSize(outOf, TYPE.ringOutOf);
  const left = cx - width / 2;
  // Cap height is about 0.7 of the size, so this centres the digits on the ring.
  const baseline = cy - TYPE.ringNumber * 0.35;
  writer.currentPage.drawText(number, {
    x: left,
    y: baseline,
    size: TYPE.ringNumber,
    font: writer.boldFont,
    color: colorPalette.textPrimary,
  });
  writer.currentPage.drawText(outOf, {
    x: left + numberWidth + 1,
    y: baseline,
    size: TYPE.ringOutOf,
    font: writer.font,
    color: colorPalette.textMuted,
  });
}

function drawResult(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
  assessment: AccessibilityAssessment,
) {
  const { result } = assessment;
  const top = writer.y;
  writer.rect(
    MARGIN_X,
    top,
    CONTENT_WIDTH,
    RESULT_CARD_HEIGHT,
    colorPalette.boxBackground,
    colorPalette.boxBorder,
  );
  const ringLeft = MARGIN_X + RESULT_CARD_INSET;
  drawChecksRing(
    writer,
    ringLeft + RING.radius,
    top - RESULT_CARD_HEIGHT / 2,
    assessment,
  );
  const textX = ringLeft + RING.radius * 2 + RING.stroke + SPACE.lg;
  const textWidth = CONTENT_RIGHT - SPACE.lg - textX;
  const lines: Array<{ text: string; style: TextStyle }> = [
    {
      text: resultLabel(t, result),
      style: {
        font: writer.boldFont,
        size: TYPE.result,
        color: resultColor(result),
      },
    },
    ...wrapText(resultSummary(t, result), writer.font, TYPE.body, textWidth)
      .slice(0, 2)
      .map((text) => ({
        text,
        style: {
          font: writer.font,
          size: TYPE.body,
          color: colorPalette.textPrimary,
        },
      })),
    {
      text:
        report.issues.length === 0
          ? t("checkAccessibility.score.noIssues", "No issues found")
          : t("checkAccessibility.score.issues", "{{count}} issues", {
              count: report.issues.length,
            }),
      style: {
        font: writer.font,
        size: TYPE.meta,
        color: colorPalette.textMuted,
      },
    },
  ];
  const textHeight = lines.reduce(
    (height, line) => height + lineHeight(line.style.size),
    0,
  );
  writer.y = top - (RESULT_CARD_HEIGHT - textHeight) / 2;
  for (const line of lines) writer.text(line.text, textX, line.style);
  writer.y = top - RESULT_CARD_HEIGHT - SPACE.md;
}

/** Wide enough for the longest result word, so every pill matches in any language. */
function pillWidth(writer: ReportWriter, t: TFunction): number {
  const words = [
    t("checkAccessibility.result.pass", "Pass"),
    t("checkAccessibility.result.partial", "Partial"),
    t("checkAccessibility.result.fail", "Fail"),
  ];
  return (
    Math.max(
      ...words.map((word) =>
        writer.boldFont.widthOfTextAtSize(word, TYPE.pill),
      ),
    ) +
    PILL.padding * 2
  );
}

/** A soft pill like the on-screen chips, with its label centred; `left` is its left edge. */
function drawPill(
  writer: ReportWriter,
  left: number,
  width: number,
  label: string,
  ok: boolean,
) {
  const base = ok ? colorPalette.success : colorPalette.danger;
  const bottom = writer.y - PILL.height + 1;
  writer.currentPage.drawRectangle({
    x: left,
    y: bottom,
    width,
    height: PILL.height,
    color: tint(base, PILL.tint),
    borderColor: tint(base, PILL.borderTint),
    borderWidth: 0.75,
  });
  const textWidth = writer.boldFont.widthOfTextAtSize(label, TYPE.pill);
  writer.currentPage.drawText(label, {
    x: left + (width - textWidth) / 2,
    y: bottom + (PILL.height - TYPE.pill * 0.7) / 2,
    size: TYPE.pill,
    font: writer.boldFont,
    color: ok ? statusText.success : statusText.danger,
  });
}

/** A checkbox whose top sits at the current line; ticked boxes are filled with a white tick. */
function drawCheckbox(writer: ReportWriter, left: number, ticked: boolean) {
  const top = writer.y - (lineHeight(TYPE.body) - CHECKBOX.size) / 2;
  const page = writer.currentPage;
  page.drawRectangle({
    x: left,
    y: top - CHECKBOX.size,
    width: CHECKBOX.size,
    height: CHECKBOX.size,
    color: ticked ? colorPalette.accent : rgb(1, 1, 1),
    borderColor: ticked ? colorPalette.accent : colorPalette.textMuted,
    borderWidth: CHECKBOX.border,
  });
  if (!ticked) return;
  const unit = CHECKBOX.size / 8;
  const tick = { thickness: 1.2, color: rgb(1, 1, 1) };
  page.drawLine({
    start: { x: left + 1.8 * unit, y: top - 4.2 * unit },
    end: { x: left + 3.4 * unit, y: top - 5.8 * unit },
    ...tick,
  });
  page.drawLine({
    start: { x: left + 3.4 * unit, y: top - 5.8 * unit },
    end: { x: left + 6.4 * unit, y: top - 2.4 * unit },
    ...tick,
  });
}

function drawManualChecks(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
  ticked: ReadonlySet<number>,
) {
  if (report.humanChecks.length === 0) return;
  sectionHeading(
    writer,
    t("checkAccessibility.sections.limits", "What this tool can't check"),
    t("checkAccessibility.manual.count", "{{ticked}} of {{total}} done", {
      ticked: ticked.size,
      total: report.humanChecks.length,
    }),
  );
  const style: TextStyle = {
    font: writer.font,
    size: TYPE.body,
    color: colorPalette.textPrimary,
  };
  const textX = MARGIN_X + CHECKBOX.size + SPACE.md;
  report.humanChecks.forEach((check, index) => {
    const lines = wrapText(
      check,
      style.font,
      style.size,
      CONTENT_RIGHT - textX,
    );
    lines.forEach((line, lineIndex) => {
      writer.ensure(lineHeight(style.size));
      if (lineIndex === 0) drawCheckbox(writer, MARGIN_X, ticked.has(index));
      writer.text(line, textX, style);
    });
    writer.y -= SPACE.xs;
  });
}

function drawIssue(
  writer: ReportWriter,
  t: TFunction,
  issue: AccessibilityIssue,
) {
  const x = MARGIN_X + INDENT;
  const width = CONTENT_RIGHT - x;
  const content = describeIssue(t, issue);
  // The title, summary and first line of explanation, so a title never ends a page.
  writer.ensure(
    lineHeight(TYPE.rowLabel) +
      lineHeight(TYPE.meta) +
      lineHeight(TYPE.explanation),
  );
  writer.paragraph(content.title, x, width, {
    font: writer.boldFont,
    size: TYPE.rowLabel,
    color: colorPalette.textPrimary,
  });
  if (content.summary) {
    writer.paragraph(content.summary, x, width, {
      font: writer.font,
      size: TYPE.meta,
      color: colorPalette.textMuted,
    });
  }
  if (content.explanation) {
    writer.y -= SPACE.xs;
    writer.paragraph(content.explanation, x, width, {
      font: writer.font,
      size: TYPE.explanation,
      color: colorPalette.textPrimary,
    });
  }
  writer.y -= SPACE.sm;
  const detailStyle: TextStyle = {
    font: writer.font,
    size: TYPE.detail,
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
      writer.ensure(lineHeight(detailStyle.size));
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
  writer.y -= SPACE.md;
}

/** A breakdown row's label with its Pass or Fail pill at the right edge. */
function drawRowHeading(
  writer: ReportWriter,
  t: TFunction,
  label: string,
  passes: boolean,
) {
  const pill = pillWidth(writer, t);
  drawPill(
    writer,
    CONTENT_RIGHT - pill,
    pill,
    passes
      ? t("checkAccessibility.result.pass", "Pass")
      : t("checkAccessibility.result.fail", "Fail"),
    passes,
  );
  writer.text(label, MARGIN_X, {
    font: writer.boldFont,
    size: TYPE.rowLabel,
    color: colorPalette.textPrimary,
  });
}

function rowDivider(writer: ReportWriter) {
  writer.rule(writer.y + SPACE.sm);
  writer.y -= SPACE.sm;
}

function drawBreakdown(
  writer: ReportWriter,
  t: TFunction,
  report: AccessibilityReport,
  { areas, basics }: AccessibilityAssessment,
) {
  sectionHeading(
    writer,
    t("checkAccessibility.sections.breakdown", "Breakdown"),
  );
  const figures = figuresSummary(t, report);
  const rowHeight = lineHeight(TYPE.rowLabel) + SPACE.md;
  areas.forEach((area, areaIndex) => {
    const passes = area.issues.length === 0;
    const note = area.id === "altText" ? figures : null;
    // A failing area keeps its first issue's title with it.
    writer.ensure(passes && !note ? rowHeight : rowHeight * 3);
    if (areaIndex > 0) rowDivider(writer);
    drawRowHeading(writer, t, categoryLabel(t, area.id), passes);
    writer.y -= SPACE.sm;
    area.issues.forEach((issue, index) => {
      if (index > 0) {
        writer.ensure(SPACE.md);
        writer.currentPage.drawLine({
          start: { x: MARGIN_X + INDENT, y: writer.y + SPACE.xs },
          end: { x: CONTENT_RIGHT, y: writer.y + SPACE.xs },
          thickness: 0.5,
          color: colorPalette.boxBorder,
        });
        writer.y -= SPACE.sm;
      }
      drawIssue(writer, t, issue);
    });
    if (note) {
      writer.paragraph(note, MARGIN_X + INDENT, CONTENT_WIDTH - INDENT, {
        font: writer.font,
        size: TYPE.meta,
        color: colorPalette.textMuted,
      });
      writer.y -= SPACE.sm;
    }
    writer.y -= SPACE.sm;
  });
  for (const basic of basics) {
    writer.ensure(rowHeight);
    rowDivider(writer);
    drawRowHeading(writer, t, basicLabel(t, basic.id), basic.ok);
    writer.y -= SPACE.md;
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
    { font: writer.boldFont, size: 12, color: statusText.danger },
  );
  if (entry.error) {
    writer.paragraph(entry.error, MARGIN_X, CONTENT_WIDTH, {
      font: writer.font,
      size: TYPE.body,
      color: colorPalette.textPrimary,
    });
  }
}

/** "Report.pdf" -> "Report-accessibility-report.pdf". */
export function accessibilityReportPdfName(fileName: string): string {
  return `${fileName.replace(/\.pdf$/i, "")}-accessibility-report.pdf`;
}

/**
 * One file's on-screen report as a PDF, with the manual checks the user ticked. Text is set in the
 * standard Helvetica fonts, so characters outside WinAnsi do not render.
 */
export async function createAccessibilityReportPdf(
  entry: AccessibilityReportEntry,
  t: TFunction,
  manualTicked: ReadonlySet<number>,
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
          "{{profile}} - {{count}} pages",
          { profile: report.profile, count: report.summary.pages },
        )
      : null,
  );
  if (report) {
    const assessment = assessAccessibilityReport(report);
    drawResult(writer, t, report, assessment);
    drawBreakdown(writer, t, report, assessment);
    drawManualChecks(writer, t, report, manualTicked);
  } else {
    drawFailedEntry(writer, t, entry);
  }

  const bytes = await doc.save();
  return new File(
    [bytes.slice().buffer],
    accessibilityReportPdfName(entry.fileName),
    { type: "application/pdf" },
  );
}
