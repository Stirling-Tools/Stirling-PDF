import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { AddPageNumbersParameters } from '@app/components/tools/addPageNumbers/useAddPageNumbersParameters';
import { resolvePageNumbers } from '@app/utils/pageSelection';
import { createFileFromApiResponse } from '@app/utils/fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

const FONT_MAP: Record<AddPageNumbersParameters['fontType'], StandardFonts> = {
  Times: StandardFonts.TimesRoman,
  Helvetica: StandardFonts.Helvetica,
  Courier: StandardFonts.Courier,
};

const MARGIN_MAP: Record<AddPageNumbersParameters['customMargin'], number> = {
  small: 0.02,
  medium: 0.035,
  large: 0.05,
  'x-large': 0.075,
};

const formatText = (
  template: string,
  pageNumber: number,
  totalPages: number,
  filename: string
) => {
  const base = template && template.trim().length > 0 ? template : '{n}';
  return base
    .replace('{n}', String(pageNumber))
    .replace('{total}', String(totalPages))
    .replace('{filename}', filename);
};

export async function addPageNumbersClientSide(
  params: AddPageNumbersParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(FONT_MAP[params.fontType]);
      const totalPages = pdfDoc.getPageCount();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const marginFactor = MARGIN_MAP[params.customMargin] ?? MARGIN_MAP.medium;

      const targetPages = params.pagesToNumber?.trim()
        ? resolvePageNumbers(params.pagesToNumber, totalPages)
        : Array.from({ length: totalPages }, (_, idx) => idx);

      if (targetPages === null) {
        throw new Error('Invalid page selection for numbering');
      }

      const pageSet = new Set(targetPages);
      let pageNumberValue = params.startingNumber ?? 1;

      for (let index = 0; index < totalPages; index += 1) {
        if (pageSet.size > 0 && !pageSet.has(index)) continue;
        const page = pdfDoc.getPage(index);
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();
        const text = formatText(params.customText, pageNumberValue, totalPages, baseName);
        const fontSize = params.fontSize;

        let x = 0;
        let y = 0;

        if (params.position === 5) {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          const textHeight = font.heightAtSize(fontSize);
          x = (pageWidth - textWidth) / 2;
          y = (pageHeight - textHeight) / 2;
        } else {
          const position = params.position;
          const xGroup = (position - 1) % 3;
          const yGroup = 2 - Math.floor((position - 1) / 3);

          if (xGroup === 0) {
            x = marginFactor * pageWidth;
          } else if (xGroup === 1) {
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            x = pageWidth / 2 - textWidth / 2;
          } else {
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            x = pageWidth - marginFactor * pageWidth - textWidth;
          }

          if (yGroup === 0) {
            y = marginFactor * pageHeight;
          } else if (yGroup === 1) {
            const textHeight = font.heightAtSize(fontSize);
            y = pageHeight / 2 - textHeight / 2;
          } else {
            y = pageHeight - marginFactor * pageHeight - fontSize;
          }
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
        });

        pageNumberValue += 1;
      }

      const updatedBytes = await pdfDoc.save();
      return createFileFromApiResponse(updatedBytes, { 'content-type': PDF_MIME_TYPE }, `${baseName}_numbersAdded.pdf`);
    })
  );
}
