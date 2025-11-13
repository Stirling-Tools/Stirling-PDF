import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useValidateSignatureTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('validateSignature.tooltip.header.title', 'Signature Validation Settings')
    },
    tips: [
      {
        title: t('validateSignature.tooltip.overview.title', 'What is Signature Validation?'),
        description: t('validateSignature.tooltip.overview.text', 'Check if PDF signatures are valid, verify signer identity, and detect if documents have been modified since signing.')
      },
      {
        title: t('validateSignature.tooltip.certificates.title', 'Certificate Validation'),
        description: t('validateSignature.tooltip.certificates.text', 'Signatures are validated using certificate chains. Upload a custom certificate if you need to validate against a specific trust source.')
      },
      {
        title: t('validateSignature.tooltip.results.title', 'Validation Results'),
        description: t('validateSignature.tooltip.results.text', 'Get detailed reports showing signature status, signer information, signing time, and document integrity.')
      }
    ]
  };
};