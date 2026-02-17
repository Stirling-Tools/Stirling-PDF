import { Badge } from '@mantine/core';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';

interface CloudBadgeProps {
  className?: string;
}

/**
 * Badge component to indicate that a tool uses cloud/SaaS backend processing
 * Displayed on tool cards when the tool will be routed to the SaaS backend
 * instead of the local bundled backend.
 */
export function CloudBadge({ className }: CloudBadgeProps) {
  return (
    <Badge
      className={className}
      leftSection={<CloudOutlinedIcon sx={{ fontSize: 12 }} />}
      variant="light"
      color="blue"
      size="xs"
    >
    </Badge>
  );
}
