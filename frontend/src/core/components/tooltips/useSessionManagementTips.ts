import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useSessionManagementTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t('sessionManagement.tooltip.header', 'Managing Signing Sessions'),
    },
    tips: [
      {
        title: t('sessionManagement.tooltip.addParticipants.title', 'Adding Participants'),
        description: t(
          'sessionManagement.tooltip.addParticipants.description',
          'You can add more participants to an active session at any time before finalization.'
        ),
        bullets: [
          t('sessionManagement.tooltip.addParticipants.bullet1', 'New participants added to the end of signing order'),
          t('sessionManagement.tooltip.addParticipants.bullet2', 'Cannot add participants after session is finalized'),
          t('sessionManagement.tooltip.addParticipants.bullet3', 'Each participant receives a notification when it\'s their turn'),
        ],
      },
      {
        title: t('sessionManagement.tooltip.finalization.title', 'Session Finalization'),
        description: t(
          'sessionManagement.tooltip.finalization.description',
          'Finalization combines all signatures into a single signed PDF. This action cannot be undone.'
        ),
        bullets: [
          t('sessionManagement.tooltip.finalization.bullet1', '<b>Full finalization</b>: All participants have signed'),
          t('sessionManagement.tooltip.finalization.bullet2', '<b>Partial finalization</b>: Some participants haven\'t signed yet'),
          t('sessionManagement.tooltip.finalization.bullet3', 'Unsigned participants will be excluded from the final document'),
          t('sessionManagement.tooltip.finalization.bullet4', 'Once finalized, you can load the signed PDF into active files'),
        ],
      },
      {
        title: t('sessionManagement.tooltip.signatureOrder.title', 'Signature Order'),
        description: t(
          'sessionManagement.tooltip.signatureOrder.description',
          'The order you specify when creating the session determines who signs first.'
        ),
        bullets: [
          t('sessionManagement.tooltip.signatureOrder.bullet1', 'Each signature is applied sequentially to the PDF'),
          t('sessionManagement.tooltip.signatureOrder.bullet2', 'Later signers can see earlier signatures'),
          t('sessionManagement.tooltip.signatureOrder.bullet3', 'Critical for approval workflows and legal chains of custody'),
        ],
      },
      {
        title: t('sessionManagement.tooltip.participantRemoval.title', 'Removing Participants'),
        description: t(
          'sessionManagement.tooltip.participantRemoval.description',
          'Participants can be removed from sessions before they sign.'
        ),
        bullets: [
          t('sessionManagement.tooltip.participantRemoval.bullet1', 'Cannot remove participants who have already signed'),
          t('sessionManagement.tooltip.participantRemoval.bullet2', 'Removed participants no longer receive notifications'),
          t('sessionManagement.tooltip.participantRemoval.bullet3', 'Signing order adjusts automatically'),
        ],
      },
    ],
  };
};
