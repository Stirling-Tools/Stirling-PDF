import { SignatureValidationReportEntry } from '@app/types/validateSignature';
import { CSV_FILENAME, booleanToString, escapeCsvValue, keyUsagesToString } from '@app/hooks/tools/validateSignature/utils/signatureUtils';

const buildCsvRows = (entries: SignatureValidationReportEntry[]): string[][] => {
  const headers = [
    'fileName',
    'signatureIndex',
    'valid',
    'chainValid',
    'trustValid',
    'notExpired',
    'revocationChecked',
    'revocationStatus',
    'signerName',
    'signatureDate',
    'reason',
    'location',
    'issuerDN',
    'subjectDN',
    'serialNumber',
    'validFrom',
    'validUntil',
    'signatureAlgorithm',
    'keySize',
    'version',
    'keyUsages',
    'selfSigned',
    'errorMessage'
  ];

  const rows: string[][] = [headers];

  entries.forEach((fileResult) => {
    if (fileResult.signatures.length > 0) {
      fileResult.signatures.forEach((signature, index) => {
        rows.push([
          fileResult.fileName,
          String(index + 1),
          booleanToString(signature.valid),
          booleanToString(signature.chainValid),
          booleanToString(signature.trustValid),
          booleanToString(signature.notExpired),
          booleanToString(signature.revocationChecked),
          signature.revocationStatus || '',
          signature.signerName || '',
          signature.signatureDate || '',
          signature.reason || '',
          signature.location || '',
          signature.issuerDN || '',
          signature.subjectDN || '',
          signature.serialNumber || '',
          signature.validFrom || '',
          signature.validUntil || '',
          signature.signatureAlgorithm || '',
          signature.keySize !== null && signature.keySize !== undefined ? String(signature.keySize) : '',
          signature.version || '',
          keyUsagesToString(signature.keyUsages),
          booleanToString(signature.selfSigned),
          signature.errorMessage || fileResult.error || ''
        ]);
      });
    } else {
      rows.push([
        fileResult.fileName,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        fileResult.error || ''
      ]);
    }
  });

  return rows;
};

export const createCsvFile = (entries: SignatureValidationReportEntry[]): File => {
  const rows = buildCsvRows(entries);
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
  return new File([csv], CSV_FILENAME, { type: 'text/csv;charset=utf-8;' });
};
