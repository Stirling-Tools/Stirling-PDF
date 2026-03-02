import type { TFunction } from 'i18next';
import { PDFFont, PDFImage, PDFPage } from '@cantoo/pdf-lib';
import { SignatureValidationReportEntry } from '@app/types/validateSignature';
import { drawFieldBox } from '@app/hooks/tools/validateSignature/outputtedPDFSections/FieldBoxSection';
import { drawThumbnailImage, drawThumbnailPlaceholder } from '@app/hooks/tools/validateSignature/outputtedPDFSections/ThumbnailSection';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';
import { formatFileSize } from '@app/hooks/tools/validateSignature/utils/pdfText';

interface DrawSummarySectionOptions {
  page: PDFPage;
  cursorY: number;
  entry: SignatureValidationReportEntry;
  font: PDFFont;
  fontBold: PDFFont;
  marginX: number;
  contentWidth: number;
  columnGap: number;
  statusText: string;
  statusColor: (typeof colorPalette)['success'];
  loadThumbnail: (url: string) => Promise<{ image: PDFImage } | null>;
  t: TFunction<'translation'>;
}

export const drawSummarySection = async ({
  page,
  cursorY,
  entry,
  font,
  fontBold,
  marginX,
  contentWidth,
  columnGap,
  loadThumbnail,
  t,
}: DrawSummarySectionOptions): Promise<number> => {
  const thumbnailWidth = 140;
  const thumbnailHeight = 180;
  const summaryX = marginX + thumbnailWidth + 24;
  const summaryWidth = contentWidth - (thumbnailWidth + 24);
  const summaryColumnWidth = (summaryWidth - columnGap) / 2;
  const rowSpacing = 8;
  const summaryTop = cursorY;
  const titleFontSize = 22;
  const subtitleFontSize = 11;

  const latestSignatureTimestamp = entry.signatures
    .map((sig) => (sig.signatureDate ? Date.parse(sig.signatureDate) : NaN))
    .filter((value) => !Number.isNaN(value));

  const latestSignatureLabel = latestSignatureTimestamp.length
    ? new Date(Math.max(...latestSignatureTimestamp)).toLocaleString()
    : '--';

  const titleBaseline = summaryTop - 12 - titleFontSize;
  page.drawText(entry.fileName, {
    x: summaryX,
    y: titleBaseline,
    size: titleFontSize,
    font: fontBold,
    color: colorPalette.textPrimary,
  });

  const subtitle = t('validateSignature.report.shortTitle', 'Signature Summary');
  const subtitleBaseline = titleBaseline - subtitleFontSize - 6;
  page.drawText(subtitle, {
    x: summaryX,
    y: subtitleBaseline,
    size: subtitleFontSize,
    font,
    color: colorPalette.textMuted,
  });

  const summaryRows: Array<
    Array<{
      label: string;
      value: string;
    }>
  > = [
    [
      { label: t('validateSignature.report.fields.fileSize', 'File Size'), value: formatFileSize(entry.fileSize) },
      { label: t('validateSignature.report.fields.created', 'Created'), value: entry.createdAtLabel ?? '--' },
    ],
    [
      { label: t('validateSignature.report.fields.signatureDate', 'Signature Date'), value: latestSignatureLabel },
      { label: t('validateSignature.report.fields.signatureCount', 'Total Signatures'), value: entry.signatures.length.toString() },
    ],
  ];

  let rowTop = subtitleBaseline - subtitleFontSize - 18;

  summaryRows.forEach((fields, rowIndex) => {
    let rowHeight = 0;

    const singleColumn = fields.length === 1;
    fields.forEach((field, index) => {
      const fieldWidth = singleColumn ? summaryWidth : summaryColumnWidth;
      const x = singleColumn ? summaryX : summaryX + index * (summaryColumnWidth + columnGap);
      const fieldHeight = drawFieldBox({
        page,
        font,
        fontBold,
        x,
        top: rowTop,
        width: fieldWidth,
        label: field.label,
        value: field.value,
      });
      rowHeight = Math.max(rowHeight, fieldHeight);
    });

    rowTop -= rowHeight;
    if (rowIndex < summaryRows.length - 1) {
      rowTop -= rowSpacing;
    }
  });

  const rightContentHeight = summaryTop - rowTop;

  const thumbX = marginX;
  const thumbTop = summaryTop;

  if (entry.thumbnailUrl) {
    const thumbnail = await loadThumbnail(entry.thumbnailUrl);
    if (thumbnail?.image) {
      page.drawRectangle({
        x: thumbX,
        y: thumbTop - thumbnailHeight,
        width: thumbnailWidth,
        height: thumbnailHeight,
        color: colorPalette.boxBackground,
        borderColor: colorPalette.boxBorder,
        borderWidth: 1,
      });
      drawThumbnailImage(page, thumbnail.image, thumbX, thumbTop, thumbnailWidth, thumbnailHeight);
    } else {
      drawThumbnailPlaceholder(page, fontBold, thumbX, thumbTop, thumbnailWidth, thumbnailHeight);
    }
  } else {
    drawThumbnailPlaceholder(page, fontBold, thumbX, thumbTop, thumbnailWidth, thumbnailHeight);
  }

  const summarySectionHeight = Math.max(thumbnailHeight, rightContentHeight);

  return summaryTop - summarySectionHeight - 32;
};
