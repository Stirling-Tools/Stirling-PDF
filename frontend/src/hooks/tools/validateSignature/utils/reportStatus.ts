import type { TFunction } from 'i18next';
import { SignatureValidationReportEntry } from '../../../../types/validateSignature';
import { colorPalette } from './pdfPalette';

export const deriveEntryStatus = (
  entry: Pick<SignatureValidationReportEntry, 'error' | 'signatures'>,
  t: TFunction<'translation'>
) => {
  if (entry.error) {
    return {
      text: t('validateSignature.status.invalid', 'Invalid'),
      color: colorPalette.danger,
    };
  }

  if (entry.signatures.length === 0) {
    return {
      text: t('validateSignature.noSignaturesShort', 'No signatures'),
      color: colorPalette.neutral,
    };
  }

  const allValid = entry.signatures.every(
    (sig) => sig.valid && sig.chainValid && sig.trustValid && sig.notExpired && sig.notRevoked
  );

  if (allValid) {
    return {
      text: t('validateSignature.status.valid', 'Valid'),
      color: colorPalette.success,
    };
  }

  return {
    text: t('validateSignature.status.reviewMissingFields', 'Needs Attention: Missing Fields'),
    color: colorPalette.warning,
  };
};
