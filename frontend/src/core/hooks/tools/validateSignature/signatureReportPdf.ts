import { PDFDocument, PDFPage, StandardFonts } from '@cantoo/pdf-lib';
import type { TFunction } from 'i18next';
import { SignatureValidationReportEntry } from '@app/types/validateSignature';
import { REPORT_PDF_FILENAME } from '@app/hooks/tools/validateSignature/utils/signatureUtils';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';
import { startReportPage, createThumbnailLoader } from '@app/hooks/tools/validateSignature/utils/pdfPageHelpers';
import { deriveEntryStatus } from '@app/hooks/tools/validateSignature/utils/reportStatus';
import { drawCenteredMessage } from '@app/hooks/tools/validateSignature/outputtedPDFSections/CenteredMessageSection';
import { drawSummarySection } from '@app/hooks/tools/validateSignature/outputtedPDFSections/SummarySection';
import { drawSignatureSection } from '@app/hooks/tools/validateSignature/outputtedPDFSections/SignatureSection';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 52;
const MARGIN_Y = 22;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const COLUMN_GAP = 18;

const drawDivider = (page: PDFPage, marginX: number, contentWidth: number, y: number) => {
  page.drawLine({
    start: { x: marginX, y },
    end: { x: marginX + contentWidth, y },
    thickness: 1,
    color: colorPalette.boxBorder,
  });
};

export const createReportPdf = async (
  entries: SignatureValidationReportEntry[],
  t: TFunction<'translation'>
): Promise<File> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const loadThumbnail = createThumbnailLoader(doc);

  for (const entry of entries) {
    const { text: statusText, color: statusColor } = deriveEntryStatus(entry, t);

    let { page, cursorY } = startReportPage({
      doc,
      font,
      fontBold,
      marginX: MARGIN_X,
      marginY: MARGIN_Y,
      contentWidth: CONTENT_WIDTH,
      pageWidth: PAGE_WIDTH,
      pageHeight: PAGE_HEIGHT,
      title: entry.fileName,
      isContinuation: false,
      t,
    });

    cursorY = await drawSummarySection({
      page,
      cursorY,
      entry,
      font,
      fontBold,
      marginX: MARGIN_X,
      contentWidth: CONTENT_WIDTH,
      columnGap: COLUMN_GAP,
      statusText,
      statusColor,
      loadThumbnail,
      t,
    });

    cursorY -= 12;
    drawDivider(page, MARGIN_X, CONTENT_WIDTH, cursorY);
    cursorY -= 16;

    if (entry.error) {
      drawCenteredMessage({
        page,
        font,
        fontBold,
        text: t('validateSignature.status.invalid', 'Invalid'),
        description: entry.error,
        marginX: MARGIN_X,
        contentWidth: CONTENT_WIDTH,
        cursorY,
        badgeColor: colorPalette.danger,
      });
      continue;
    }

    if (entry.signatures.length === 0) {
      drawCenteredMessage({
        page,
        font,
        fontBold,
        text: t('validateSignature.noSignaturesShort', 'No signatures'),
        description: t('validateSignature.noSignatures', 'No digital signatures found in this document'),
        marginX: MARGIN_X,
        contentWidth: CONTENT_WIDTH,
        cursorY,
        badgeColor: colorPalette.neutral,
      });
      continue;
    }

    for (let i = 0; i < entry.signatures.length; i += 1) {
      // After the first signature, start a new page per signature
      if (i > 0) {
        ({ page, cursorY } = startReportPage({
          doc,
          font,
          fontBold,
          marginX: MARGIN_X,
          marginY: MARGIN_Y,
          contentWidth: CONTENT_WIDTH,
          pageWidth: PAGE_WIDTH,
          pageHeight: PAGE_HEIGHT,
          title: entry.fileName,
          isContinuation: true,
          t,
        }));
      }

      cursorY = drawSignatureSection({
        page,
        cursorY,
        signature: entry.signatures[i],
        index: i,
        marginX: MARGIN_X,
        contentWidth: CONTENT_WIDTH,
        columnGap: COLUMN_GAP,
        font,
        fontBold,
        t,
      });
    }
  }

  const pdfBytes = await doc.save();
  const copy = pdfBytes.slice();
  return new File([copy.buffer], REPORT_PDF_FILENAME, { type: 'application/pdf' });
};
