import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface PendingBadgeProps {
  show: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

/**
 * Badge to show when a setting has been saved but requires restart to take effect.
 */
export default function PendingBadge({ show, size = 'xs' }: PendingBadgeProps) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <Badge color="orange" size={size} variant="light">
      {t('admin.settings.restartRequired', 'Restart Required')}
    </Badge>
  );
}
