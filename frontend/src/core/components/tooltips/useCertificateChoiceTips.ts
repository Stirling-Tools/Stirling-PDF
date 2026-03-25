import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useCertificateChoiceTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('certificateChoice.tooltip.header', 'Certificate Types'),
    },
    tips: [
      {
        title: t('certificateChoice.tooltip.personal.title', 'Personal Certificate'),
        description: t(
          'certificateChoice.tooltip.personal.description',
          'An auto-generated certificate unique to your user account. Suitable for individual signatures.'
        ),
        bullets: [
          t('certificateChoice.tooltip.personal.bullet1', 'Generated automatically on first use'),
          t('certificateChoice.tooltip.personal.bullet2', 'Tied to your user account'),
          t('certificateChoice.tooltip.personal.bullet3', 'Cannot be shared with other users'),
          t('certificateChoice.tooltip.personal.bullet4', 'Best for: Personal documents, individual accountability'),
        ],
      },
      {
        title: t('certificateChoice.tooltip.organization.title', 'Organization Certificate'),
        description: t(
          'certificateChoice.tooltip.organization.description',
          'A shared certificate provided by your organization. Used for company-wide signing authority.'
        ),
        bullets: [
          t('certificateChoice.tooltip.organization.bullet1', 'Managed by system administrators'),
          t('certificateChoice.tooltip.organization.bullet2', 'Shared across authorized users'),
          t('certificateChoice.tooltip.organization.bullet3', 'Represents company identity, not individual'),
          t('certificateChoice.tooltip.organization.bullet4', 'Best for: Official documents, team signatures'),
        ],
      },
      {
        title: t('certificateChoice.tooltip.upload.title', 'Upload Custom P12'),
        description: t(
          'certificateChoice.tooltip.upload.description',
          'Use your own PKCS#12 certificate file. Provides full control over certificate properties.'
        ),
        bullets: [
          t('certificateChoice.tooltip.upload.bullet1', 'Requires P12/PFX file and password'),
          t('certificateChoice.tooltip.upload.bullet2', 'Can be issued by external Certificate Authorities'),
          t('certificateChoice.tooltip.upload.bullet3', 'Higher trust level for legal documents'),
          t('certificateChoice.tooltip.upload.bullet4', 'Best for: Legally binding contracts, external validation'),
        ],
      },
    ],
  };
};
