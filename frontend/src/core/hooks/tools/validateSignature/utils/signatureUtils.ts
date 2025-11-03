import { SignatureValidationBackendResult, SignatureValidationSignature } from '@app/types/validateSignature';
import type { StirlingFile } from '@app/types/fileContext';

export const RESULT_JSON_FILENAME = 'signature-validation.json';
export const CSV_FILENAME = 'signature-validation.csv';
export const REPORT_PDF_FILENAME = 'signature-validation-report.pdf';

export const coerceString = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

export const coerceNumber = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

export const escapeCsvValue = (raw: string): string => {
  let value = raw ?? '';
  value = value.replace(/\r?\n|\r/g, ' ');
  if (value.includes('"')) {
    value = value.replace(/"/g, '""');
  }
  if (value.includes(',') || value.includes('"') || value.includes(';')) {
    value = `"${value}"`;
  }
  return value;
};

export const booleanToString = (value: boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return value ? 'true' : 'false';
};

export const keyUsagesToString = (keyUsages: string[] | undefined): string => {
  if (!keyUsages || keyUsages.length === 0) {
    return '';
  }
  return keyUsages.join('; ');
};

export const normalizeBackendResult = (
  item: SignatureValidationBackendResult,
  stirlingFile: StirlingFile,
  index: number
): SignatureValidationSignature => ({
  id: `${stirlingFile.fileId}-${index}`,
  valid: Boolean(item.valid),
  chainValid: Boolean(item.chainValid),
  trustValid: Boolean(item.trustValid),
  notExpired: Boolean(item.notExpired),
  revocationChecked:
    item.revocationChecked === null || item.revocationChecked === undefined
      ? null
      : Boolean(item.revocationChecked),
  revocationStatus: item.revocationStatus ? coerceString(item.revocationStatus) : null,
  validationTimeSource: item.validationTimeSource ? coerceString(item.validationTimeSource) : null,
  signerName: coerceString(item.signerName),
  signatureDate: coerceString(item.signatureDate),
  reason: coerceString(item.reason),
  location: coerceString(item.location),
  issuerDN: coerceString(item.issuerDN),
  subjectDN: coerceString(item.subjectDN),
  serialNumber: coerceString(item.serialNumber),
  validFrom: coerceString(item.validFrom),
  validUntil: coerceString(item.validUntil),
  signatureAlgorithm: coerceString(item.signatureAlgorithm),
  keySize: coerceNumber(item.keySize),
  version: coerceString(item.version),
  keyUsages: Array.isArray(item.keyUsages) ? item.keyUsages.filter(Boolean).map(coerceString) : [],
  selfSigned: Boolean(item.selfSigned),
  errorMessage: item.errorMessage ? coerceString(item.errorMessage) : null,
});
