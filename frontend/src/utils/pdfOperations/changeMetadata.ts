import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib';
import type { ChangeMetadataParameters } from '../../hooks/tools/changeMetadata/useChangeMetadataParameters';
import { createFileFromApiResponse } from '../fileResponseUtils';

const PDF_MIME_TYPE = 'application/pdf';

const STANDARD_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'Trapped',
]);

const formatPdfDate = (date: Date): string => {
  const pad = (value: number, length = 2) => value.toString().padStart(length, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offset = date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offset) / 60);
  const offsetMinutes = Math.abs(offset) % 60;
  const sign = offset <= 0 ? '+' : '-';
  return `D:${year}${month}${day}${hours}${minutes}${seconds}${sign}${pad(offsetHours)}'${pad(offsetMinutes)}'`;
};

const ensureInfoDict = (pdfDoc: PDFDocument): PDFDict => {
  const infoRef = pdfDoc.context.trailerInfo.Info;
  let info = infoRef ? pdfDoc.context.lookup(infoRef, PDFDict) : undefined;
  if (!info) {
    info = pdfDoc.context.obj({});
    pdfDoc.context.trailerInfo.Info = info;
  }
  return info;
};

const setInfoString = (info: PDFDict, key: string, value?: string | null) => {
  const trimmedKey = typeof key === 'string' ? key.trim() : key;
  if (!trimmedKey) return;

  try {
    const pdfKey = PDFName.of(trimmedKey);
    const trimmedValue = typeof value === 'string' ? value.trim() : value;
    if (trimmedValue && trimmedValue.length > 0) {
      info.set(pdfKey, PDFString.of(trimmedValue));
    } else {
      info.delete(pdfKey);
    }
  } catch {
    // Ignore invalid custom metadata keys that cannot be represented as PDF names
  }
};

const setInfoDate = (info: PDFDict, key: string, value: Date | null) => {
  const pdfKey = PDFName.of(key);
  if (value) {
    info.set(pdfKey, PDFString.of(formatPdfDate(value)));
  } else {
    info.delete(pdfKey);
  }
};

export async function changeMetadataClientSide(
  params: ChangeMetadataParameters,
  files: File[]
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      let info = ensureInfoDict(pdfDoc);

      if (params.deleteAll) {
        info = pdfDoc.context.obj({});
        pdfDoc.context.trailerInfo.Info = info;
        const catalogDict = (pdfDoc.catalog as any)?.dict;
        if (catalogDict) {
          catalogDict.delete(PDFName.of('Metadata'));
          catalogDict.delete(PDFName.of('PieceInfo'));
        }
      }

      if (!params.deleteAll) {
        setInfoString(info, 'Title', params.title);
        setInfoString(info, 'Author', params.author);
        setInfoString(info, 'Subject', params.subject);
        setInfoString(info, 'Keywords', params.keywords);
        setInfoString(info, 'Creator', params.creator);
        setInfoString(info, 'Producer', params.producer);
        setInfoString(info, 'Trapped', params.trapped && params.trapped !== ('UNKNOWN' as any) ? params.trapped : undefined);
        setInfoDate(info, 'CreationDate', params.creationDate);
        setInfoDate(info, 'ModDate', params.modificationDate);

        // Remove any prior custom entries before adding the new set
        const existingKeys = Array.from(info.keys());
        existingKeys
          .filter((name) => {
            const key = name.toString().replace('/', '');
            return !STANDARD_KEYS.has(key);
          })
          .forEach((name) => info.delete(name));

        for (const entry of params.customMetadata) {
          if (entry.key.trim() && entry.value.trim()) {
            setInfoString(info, entry.key, entry.value);
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      return createFileFromApiResponse(pdfBytes, { 'content-type': PDF_MIME_TYPE }, `${file.name.replace(/\.[^.]+$/, '')}_metadata.pdf`);
    })
  );
}
