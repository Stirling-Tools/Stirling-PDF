import type { TFunction } from 'i18next';
import { PDFFont, PDFPage } from '@cantoo/pdf-lib';
import { SignatureValidationSignature } from '@app/types/validateSignature';
import { drawFieldBox } from '@app/hooks/tools/validateSignature/outputtedPDFSections/FieldBoxSection';
import { drawStatusBadge } from '@app/hooks/tools/validateSignature/outputtedPDFSections/StatusBadgeSection';
import { computeSignatureStatus, statusKindToPdfColor } from '@app/hooks/tools/validateSignature/utils/signatureStatus';
import { formatDate } from '@app/hooks/tools/validateSignature/utils/pdfText';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';

interface DrawSignatureSectionOptions {
  page: PDFPage;
  cursorY: number;
  signature: SignatureValidationSignature;
  index: number;
  marginX: number;
  contentWidth: number;
  columnGap: number;
  font: PDFFont;
  fontBold: PDFFont;
  t: TFunction<'translation'>;
}

export const drawSignatureSection = ({
  page,
  cursorY,
  signature,
  index,
  marginX,
  contentWidth,
  columnGap,
  font,
  fontBold,
  t,
}: DrawSignatureSectionOptions): number => {
  const columnWidth = (contentWidth - columnGap) / 2;

  const heading = `${t('validateSignature.signature._value', 'Signature')} ${index + 1}`;
  page.drawText(heading, {
    x: marginX,
    y: cursorY,
    size: 14,
    font: fontBold,
    color: colorPalette.textPrimary,
  });

  const status = computeSignatureStatus(signature, t);
  const statusColor = statusKindToPdfColor(status.kind);

  const headingWidth = fontBold.widthOfTextAtSize(heading, 14);
  drawStatusBadge({
    page,
    font,
    fontBold,
    text: status.label,
    x: marginX + headingWidth + 16,
    y: cursorY + 14,
    color: statusColor,
  });

  let nextY = cursorY - 20;

  const signatureFields = [
    { label: t('validateSignature.signer', 'Signer'), value: signature.signerName || '-' },
    { label: t('validateSignature.date', 'Date'), value: formatDate(signature.signatureDate) },
    { label: t('validateSignature.reason', 'Reason'), value: signature.reason || '-' },
    { label: t('validateSignature.location', 'Location'), value: signature.location || '-' },
  ];

  for (let i = 0; i < signatureFields.length; i += 2) {
    const leftField = signatureFields[i];
    const rightField = signatureFields[i + 1];

    const leftHeight = drawFieldBox({
      page,
      font,
      fontBold,
      x: marginX,
      top: nextY,
      width: columnWidth,
      label: leftField.label,
      value: leftField.value,
    });

    let rowHeight = leftHeight;
    if (rightField) {
      const rightHeight = drawFieldBox({
        page,
        font,
        fontBold,
        x: marginX + columnWidth + columnGap,
        top: nextY,
        width: columnWidth,
        label: rightField.label,
        value: rightField.value,
      });
      rowHeight = Math.max(leftHeight, rightHeight);
    }

    nextY -= rowHeight + 8;
  }

  nextY -= 6;
  page.drawLine({
    start: { x: marginX, y: nextY },
    end: { x: marginX + contentWidth, y: nextY },
    thickness: 1,
    color: colorPalette.boxBorder,
  });
  nextY -= 20; 

  const certificateFields = [
    { label: t('validateSignature.cert.issuer', 'Issuer'), value: signature.issuerDN || '-' },
    { label: t('validateSignature.cert.subject', 'Subject'), value: signature.subjectDN || '-' },
    { label: t('validateSignature.cert.serialNumber', 'Serial Number'), value: signature.serialNumber || '-' },
    { label: t('validateSignature.cert.algorithm', 'Algorithm'), value: signature.signatureAlgorithm || '-' },
    { label: t('validateSignature.cert.validFrom', 'Valid From'), value: formatDate(signature.validFrom) },
    { label: t('validateSignature.cert.validUntil', 'Valid Until'), value: formatDate(signature.validUntil) },
    {
      label: t('validateSignature.cert.keySize', 'Key Size'),
      value:
        signature.keySize != null
          ? `${signature.keySize} ${t('validateSignature.cert.bits', 'bits')}`
          : '--',
    },
    { label: t('validateSignature.cert.version', 'Version'), value: signature.version || '-' },
    {
      label: t('validateSignature.cert.keyUsage', 'Key Usage'),
      value:
        signature.keyUsages && signature.keyUsages.length > 0
          ? signature.keyUsages.join(', ')
          : '--',
    },
    {
      label: t('validateSignature.cert.selfSigned', 'Self-Signed'),
      value: signature.selfSigned ? t('yes', 'Yes') : t('no', 'No'),
    },
  ];

  for (let i = 0; i < certificateFields.length; i += 2) {
    const leftField = certificateFields[i];
    const rightField = certificateFields[i + 1];

    const leftHeight = drawFieldBox({
      page,
      font,
      fontBold,
      x: marginX,
      top: nextY,
      width: columnWidth,
      label: leftField.label,
      value: leftField.value,
    });

    let rowHeight = leftHeight;
    if (rightField) {
      const rightHeight = drawFieldBox({
        page,
        font,
        fontBold,
        x: marginX + columnWidth + columnGap,
        top: nextY,
        width: columnWidth,
        label: rightField.label,
        value: rightField.value,
      });
      rowHeight = Math.max(leftHeight, rightHeight);
    }

    nextY -= rowHeight + 8;
  }

  return nextY - 12;
};
