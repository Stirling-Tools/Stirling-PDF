import { Box, rem } from '@mantine/core';
import { BackendHealthIndicator } from '@app/components/BackendHealthIndicator';

interface RightRailFooterExtensionsProps {
  className?: string;
}

export function RightRailFooterExtensions({ className }: RightRailFooterExtensionsProps) {
  return (
    <Box
      className={className}
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: rem(12),
      }}
    >
      <BackendHealthIndicator />
    </Box>
  );
}
