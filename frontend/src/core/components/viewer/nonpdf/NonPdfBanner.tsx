import { Badge, Box, Button, Group } from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

import type { FileTypeMeta } from '@app/components/viewer/nonpdf/types';

interface NonPdfBannerProps {
  meta: FileTypeMeta;
  onConvertToPdf?: () => void;
}

export function NonPdfBanner({ meta, onConvertToPdf }: NonPdfBannerProps) {
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="center"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      <Badge
        variant="default"
        size="lg"
        leftSection={
          <Box style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
            {meta.icon}
          </Box>
        }
        style={{ fontWeight: 600 }}
      >
        {meta.label} File
      </Badge>
      {onConvertToPdf && (
        <Button
          size="xs"
          variant="light"
          color="orange"
          leftSection={<PictureAsPdfIcon style={{ fontSize: '0.9rem' }} />}
          onClick={onConvertToPdf}
        >
          Convert to PDF
        </Button>
      )}
    </Group>
  );
}
