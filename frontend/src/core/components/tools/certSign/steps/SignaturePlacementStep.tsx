import { Button, Stack, Text, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface SignaturePlacementStepProps {
  isPlaced: boolean;
  placementInfo: { page: number; x: number; y: number } | null;
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
  children?: React.ReactNode; // PDF viewer with placement capability
}

export const SignaturePlacementStep: React.FC<SignaturePlacementStepProps> = ({
  isPlaced,
  placementInfo,
  onBack,
  onNext,
  disabled = false,
  children,
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Text size="xs" c="dimmed">
        {isPlaced
          ? t(
              'certSign.collab.signRequest.steps.signaturePlaced',
              'Signature placed on page {{page}}. You can adjust the position by clicking again or continue to review.',
              { page: placementInfo?.page || 1 }
            )
          : t(
              'certSign.collab.signRequest.steps.clickToPlace',
              'Click on the PDF where you would like your signature to appear.'
            )}
      </Text>

      {/* PDF Viewer (passed as children) */}
      <div style={{ flex: 1, minHeight: '400px' }}>{children}</div>

      <Group gap="sm">
        <Button variant="default" onClick={onBack} leftSection={<ArrowBackIcon sx={{ fontSize: 16 }} />}>
          {t('certSign.collab.signRequest.steps.back', 'Back')}
        </Button>
        <Button onClick={onNext} disabled={!isPlaced || disabled} style={{ flex: 1 }}>
          {t('certSign.collab.signRequest.steps.continueToReview', 'Continue to Review')}
        </Button>
      </Group>
    </Stack>
  );
};
