import { Badge, Tooltip } from '@mantine/core';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import { useTranslation } from 'react-i18next';

interface CloudBadgeProps {
  className?: string;
}

/**
 * Badge component to indicate that a tool uses cloud/SaaS backend processing
 * Displayed on tool cards when the tool will be routed to the SaaS backend
 * instead of the local bundled backend.
 */
export function CloudBadge({ className }: CloudBadgeProps) {
  const { t } = useTranslation();

  return (
    <Tooltip
      label={t('cloudBadge.tooltip', 'This operation will use your cloud credits')}
      position="top"
      withArrow
    >
      <Badge
        className={className}
        leftSection={<CloudOutlinedIcon sx={{ fontSize: 12 }} />}
        variant="light"
        color="blue"
        size="xs"
      >
      </Badge>
    </Tooltip>
  );
}
