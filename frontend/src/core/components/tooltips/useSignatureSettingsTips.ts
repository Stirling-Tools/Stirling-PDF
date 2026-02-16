import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useSignatureSettingsTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('signatureSettings.tooltip.header', 'Signature Appearance Settings'),
    },
    tips: [
      {
        title: t('signatureSettings.tooltip.visibility.title', 'Signature Visibility'),
        description: t(
          'signatureSettings.tooltip.visibility.description',
          'Controls whether the signature is visible on the document or embedded invisibly.'
        ),
        bullets: [
          t('signatureSettings.tooltip.visibility.bullet1', '<b>Visible</b>: Signature appears on PDF with custom appearance'),
          t('signatureSettings.tooltip.visibility.bullet2', '<b>Invisible</b>: Certificate embedded without visual mark'),
          t('signatureSettings.tooltip.visibility.bullet3', 'Invisible signatures still provide cryptographic validation'),
        ],
      },
      {
        title: t('signatureSettings.tooltip.reason.title', 'Signature Reason'),
        description: t(
          'signatureSettings.tooltip.reason.description',
          'Optional text explaining why the document is being signed. Stored in certificate metadata.'
        ),
        bullets: [
          t('signatureSettings.tooltip.reason.bullet1', 'Examples: "Approval", "Contract Agreement", "Review Complete"'),
          t('signatureSettings.tooltip.reason.bullet2', 'Visible in PDF signature properties'),
          t('signatureSettings.tooltip.reason.bullet3', 'Useful for audit trails and compliance'),
        ],
      },
      {
        title: t('signatureSettings.tooltip.location.title', 'Signature Location'),
        description: t(
          'signatureSettings.tooltip.location.description',
          'Optional geographic location where the signature was applied. Stored in certificate metadata.'
        ),
        bullets: [
          t('signatureSettings.tooltip.location.bullet1', 'Examples: "New York, USA", "London Office", "Remote"'),
          t('signatureSettings.tooltip.location.bullet2', 'Not the same as page position'),
          t('signatureSettings.tooltip.location.bullet3', 'May be required for certain legal jurisdictions'),
        ],
      },
      {
        title: t('signatureSettings.tooltip.logo.title', 'Company Logo'),
        description: t(
          'signatureSettings.tooltip.logo.description',
          'Add a company logo to visible signatures for branding and authenticity.'
        ),
        bullets: [
          t('signatureSettings.tooltip.logo.bullet1', 'Displayed alongside signature and text'),
          t('signatureSettings.tooltip.logo.bullet2', 'Supports PNG, JPG formats'),
          t('signatureSettings.tooltip.logo.bullet3', 'Enhances professional appearance'),
        ],
      },
    ],
  };
};
