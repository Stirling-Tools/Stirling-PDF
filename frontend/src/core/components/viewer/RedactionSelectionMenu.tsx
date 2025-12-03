import { useRedaction as useEmbedPdfRedaction, SelectionMenuProps } from '@embedpdf/plugin-redaction/react';
import { ActionIcon, Tooltip, Button, Group } from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

/**
 * Custom menu component that appears when a pending redaction mark is selected.
 * Allows users to remove or apply individual pending marks.
 */
export function RedactionSelectionMenu({ item, selected, menuWrapperProps }: SelectionMenuProps) {
  const { provides } = useEmbedPdfRedaction();
  
  if (!selected || !item) return null;

  const handleRemove = () => {
    if (provides?.removePending) {
      provides.removePending(item.page, item.id);
    }
  };

  const handleApply = () => {
    if (provides?.commitPending) {
      provides.commitPending(item.page, item.id);
    }
  };

  return (
    <div {...menuWrapperProps}>
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 8,
          pointerEvents: 'auto',
          zIndex: 100,
          backgroundColor: 'var(--mantine-color-body)',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--mantine-color-default-border)',
          // Fixed size to prevent browser zoom affecting layout
          fontSize: '14px',
          minWidth: '180px',
        }}
      >
        <Group gap="sm" wrap="nowrap" justify="center">
          <Tooltip label="Remove this mark">
            <ActionIcon
              variant="light"
              color="gray"
              size="md"
              onClick={handleRemove}
              style={{ flexShrink: 0 }}
            >
              <DeleteIcon style={{ fontSize: 18 }} />
            </ActionIcon>
          </Tooltip>
          
          <Tooltip label="Apply this redaction permanently">
            <Button
              variant="filled"
              color="red"
              size="xs"
              onClick={handleApply}
              leftSection={<CheckCircleIcon style={{ fontSize: 16 }} />}
              styles={{
                root: { flexShrink: 0, whiteSpace: 'nowrap' },
              }}
            >
              Apply (permanent)
            </Button>
          </Tooltip>
        </Group>
      </div>
    </div>
  );
}

