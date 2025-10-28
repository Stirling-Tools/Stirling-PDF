import type { TFunction } from 'i18next';
import { SignatureValidationReportEntry } from '@app/types/validateSignature';
import { colorPalette } from '@app/hooks/tools/validateSignature/utils/pdfPalette';

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

  // File-level status is Valid only if every signature is cryptographically valid.
  const allValid = entry.signatures.every((sig) => sig.valid);

  if (allValid) {
    return {
      text: t('validateSignature.status.valid', 'Valid'),
      color: colorPalette.success,
    };
  }

  return {
    text: t('validateSignature.status.invalid', 'Invalid'),
    color: colorPalette.danger,
  };
};
