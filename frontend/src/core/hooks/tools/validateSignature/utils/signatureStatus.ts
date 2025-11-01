import type { TFunction } from 'i18next';
import type { SignatureValidationSignature } from '@app/types/validateSignature';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';

export type SignatureStatusKind = 'valid' | 'warning' | 'invalid' | 'neutral';

export interface SignatureStatus {
  kind: SignatureStatusKind;
  label: string;
  details: string[];
}

export const computeSignatureStatus = (
  signature: SignatureValidationSignature,
  t: TFunction<'translation'>
): SignatureStatus => {
  // Start with error
  if (signature.errorMessage) {
    return {
      kind: 'invalid',
      label: t('validateSignature.status.invalid', 'Invalid'),
      details: [signature.errorMessage],
    };
  }

  const issues: string[] = [];
  const trustIssues: string[] = [];

  if (!signature.valid) {
    issues.push(t('validateSignature.issue.signatureInvalid', 'Signature cryptographic check failed'));
  }
  if (!signature.chainValid) {
    trustIssues.push(t('validateSignature.issue.chainInvalid', 'Certificate chain invalid'));
  }
  if (!signature.trustValid) {
    trustIssues.push(t('validateSignature.issue.trustInvalid', 'Certificate not trusted'));
  }
  if (!signature.notExpired) {
    trustIssues.push(t('validateSignature.issue.certExpired', 'Certificate expired'));
  }

  // Use revocationStatus from backend; default to 'unknown' when absent
  const revStatus = signature.revocationStatus ?? 'unknown';
  if (revStatus === 'revoked') {
    trustIssues.push(t('validateSignature.issue.certRevoked', 'Certificate revoked'));
  } else if (revStatus === 'soft-fail') {
    trustIssues.push(t('validateSignature.issue.certRevocationUnknown', 'Certificate revocation status unknown'));
  }

  // Aggregate all issues for details UI (ignore missing metadata fields; they are optional)
  issues.push(...trustIssues);

  // If cryptographic validation failed, mark as Invalid
  if (!signature.valid) {
    return {
      kind: 'invalid',
      label: t('validateSignature.status.invalid', 'Invalid'),
      details: issues,
    };
  }

  // Otherwise, mark as Valid regardless of optional field presence and trust warnings
  return {
    kind: 'valid',
    label: t('validateSignature.status.valid', 'Valid'),
    details: issues,
  };
};

export const statusKindToPdfColor = (kind: SignatureStatusKind) => {
  switch (kind) {
    case 'valid':
      return colorPalette.success;
    case 'warning':
      return colorPalette.warning;
    case 'invalid':
      return colorPalette.danger;
    default:
      return colorPalette.neutral;
  }
};


