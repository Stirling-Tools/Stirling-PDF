import type { TFunction } from 'i18next';
import type { SignatureValidationSignature } from '../../../../types/validateSignature';
import { colorPalette } from './pdfPalette';

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

  // Use new revocationStatus field if available, fallback to notRevoked for backward compatibility
  const revStatus = signature.revocationStatus || (signature.notRevoked ? 'good' : 'unknown');
  if (revStatus === 'revoked') {
    trustIssues.push(t('validateSignature.issue.certRevoked', 'Certificate revoked'));
  } else if (revStatus === 'soft-fail') {
    trustIssues.push(t('validateSignature.issue.certRevocationUnknown', 'Certificate revocation status unknown'));
  }
  // Don't report anything for 'not-checked', 'good', or 'unknown' unless actually revoked

  // Check for missing common metadata fields
  const missing: string[] = [];
  if (!signature.signerName || signature.signerName.trim().length === 0) missing.push(t('validateSignature.signer', 'Signer'));
  if (!signature.reason || signature.reason.trim().length === 0) missing.push(t('validateSignature.reason', 'Reason'));
  if (!signature.location || signature.location.trim().length === 0) missing.push(t('validateSignature.location', 'Location'));

  // Aggregate all issues for details UI
  issues.push(...trustIssues);
  if (missing.length > 0) {
    issues.push(t('validateSignature.issue.missingFields', 'Missing fields') + `: ${missing.join(', ')}`);
  }

  if (issues.length === 0) {
    return {
      kind: 'valid',
      label: t('validateSignature.status.validFull', 'Fully Valid'),
      details: [],
    };
  }

  // Invalid ONLY when cryptographic signature itself failed or an explicit backend error occurred
  if (!signature.valid) {
    return {
      kind: 'invalid',
      label: t('validateSignature.status.invalid', 'Invalid'),
      details: issues,
    };
  }

  // Otherwise, it's a signed document with issues
  const onlyMissing = missing.length > 0 && trustIssues.length === 0;
  const onlyTrust = missing.length === 0 && trustIssues.length > 0;

  if (onlyMissing) {
    return {
      kind: 'warning',
      label: t('validateSignature.status.missingFields', 'Needs Attention: Missing Fields'),
      details: issues,
    };
  }

  if (onlyTrust) {
    return {
      kind: 'warning',
      label: t('validateSignature.status.trustIssues', 'Needs Attention: Trust/Chain'),
      details: issues,
    };
  }

  return {
    kind: 'warning',
    label: t('validateSignature.status.needsAttention', 'Needs Attention'),
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


