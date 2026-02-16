import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useGroupSigningTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('groupSigning.tooltip.header', 'About Group Signing'),
    },
    tips: [
      {
        title: t('groupSigning.tooltip.sequential.title', 'Sequential Signing'),
        description: t(
          'groupSigning.tooltip.sequential.description',
          'Participants sign documents in the order you specify. Each signer receives a notification when it is their turn.'
        ),
        bullets: [
          t('groupSigning.tooltip.sequential.bullet1', 'First participant must sign before the second can access the document'),
          t('groupSigning.tooltip.sequential.bullet2', 'Ensures proper signing order for legal compliance'),
          t('groupSigning.tooltip.sequential.bullet3', 'You can reorder participants by dragging them in the list'),
        ],
      },
      {
        title: t('groupSigning.tooltip.roles.title', 'Participant Roles'),
        description: t(
          'groupSigning.tooltip.roles.description',
          'You control the signature appearance settings for all participants.'
        ),
        bullets: [
          t('groupSigning.tooltip.roles.bullet1', 'Owner (you): Creates session, configures signature defaults, finalizes document'),
          t('groupSigning.tooltip.roles.bullet2', 'Participants: Create their signature, choose certificate, place on PDF'),
          t('groupSigning.tooltip.roles.bullet3', 'Participants cannot modify signature visibility, reason, or location settings'),
        ],
      },
      {
        title: t('groupSigning.tooltip.finalization.title', 'Finalization Process'),
        description: t(
          'groupSigning.tooltip.finalization.description',
          'Once all participants have signed (or you choose to finalize early), you can generate the final signed PDF.'
        ),
        bullets: [
          t('groupSigning.tooltip.finalization.bullet1', 'All signatures are applied in the participant order you specified'),
          t('groupSigning.tooltip.finalization.bullet2', 'You can finalize with partial signatures if needed'),
          t('groupSigning.tooltip.finalization.bullet3', 'Once finalized, the session cannot be modified'),
        ],
      },
    ],
  };
};
