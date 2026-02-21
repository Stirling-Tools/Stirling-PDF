import { Group, Text } from '@mantine/core';
import CheckCircleIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

interface FeatureListItemProps {
  children: React.ReactNode;
  included: boolean;
  color?: string;
  dimmed?: boolean;
  fw?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | string;
}

export function FeatureListItem({
  children,
  included,
  color = 'var(--color-primary-600)',
  dimmed = false,
  fw = 400,
  size = 'sm'
}: FeatureListItemProps) {
  const Icon = included ? CheckCircleIcon : CloseIcon;
  const iconColor = included ? color : 'var(--color-red-600)';

  // Map Mantine sizes to icon font sizes
  const iconSizeMap: Record<string, number> = {
    xs: 14,
    sm: 16,
    md: 18,
    lg: 20
  };

  // Determine icon size - use mapped value if it exists, otherwise use the string directly
  const iconSize = iconSizeMap[size] || size;

  // For Text component, only use Mantine sizes if the size is a predefined key
  const textSize = iconSizeMap[size] ? size : undefined;

  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Icon
        sx={{ fontSize: iconSize, color: iconColor, flexShrink: 0, marginTop: '2px' }}
      />
      <Text size={textSize} c={dimmed ? 'dimmed' : undefined} fw={fw} style={textSize ? undefined : { fontSize: size }}>
        {children}
      </Text>
    </Group>
  );
}
