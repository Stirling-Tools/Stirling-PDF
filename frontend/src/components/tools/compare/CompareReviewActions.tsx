import { Button, Group, Stack, Text } from '@mantine/core';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { useTranslation } from 'react-i18next';

interface CompareReviewActionsProps {
  onSwitchOrder: () => void;
  onDownloadSummary: () => void;
  disableDownload?: boolean;
  disableSwitch?: boolean;
}

const CompareReviewActions = ({
  onSwitchOrder,
  onDownloadSummary,
  disableDownload = false,
  disableSwitch = false,
}: CompareReviewActionsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {t('compare.review.actionsHint', 'Review the comparison, switch document roles, or export the summary.')}
      </Text>
      <Group grow>
        <Button
          variant="outline"
          color="var(--mantine-color-gray-6)"
          leftSection={<SwapHorizRoundedIcon fontSize="small" />}
          onClick={onSwitchOrder}
          disabled={disableSwitch}
        >
          {t('compare.review.switchOrder', 'Switch order')}
        </Button>
        <Button
          color="blue"
          leftSection={<DownloadRoundedIcon fontSize="small" />}
          onClick={onDownloadSummary}
          disabled={disableDownload}
        >
          {t('compare.review.exportSummary', 'Export summary')}
        </Button>
      </Group>
    </Stack>
  );
};

export default CompareReviewActions;

