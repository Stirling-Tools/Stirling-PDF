import { Group, TextInput, Button, Text, Flex } from '@mantine/core';
import LocalIcon from '../../shared/LocalIcon';
import { Tooltip } from '../../shared/Tooltip';
import { usePageSelectionTips } from '../../tooltips/usePageSelectionTips';
import classes from './BulkSelectionPanel.module.css';

interface PageSelectionInputProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  onUpdatePagesFromCSV: (override?: string) => void;
  onClear: () => void;
}

const PageSelectionInput = ({
  csvInput,
  setCsvInput,
  onUpdatePagesFromCSV,
  onClear,
}: PageSelectionInputProps) => {
  const pageSelectionTips = usePageSelectionTips();

  return (
    <Group className={classes.panelGroup}>
      <TextInput
        value={csvInput}
        onChange={(e) => {
          const next = e.target.value;
          setCsvInput(next);
          onUpdatePagesFromCSV(next);
        }}
        placeholder="1,3,5-10"
        rightSection={
          csvInput && (
            <Button
              variant="subtle"
              size="xs"
              onClick={onClear}
              style={{ 
                color: 'var(--mantine-color-gray-6)',
                minWidth: 'auto',
                width: '24px',
                height: '24px',
                padding: 0
              }}
            >
              ×
            </Button>
          )
        }
        label={
            <Tooltip
              position="left"
              offset={20}
              header={pageSelectionTips.header}
              portalTarget={document.body}
              pinOnClick={true}
              containerStyle={{ marginTop: "1rem"}}
              tips={pageSelectionTips.tips}
            >
              <Flex onClick={(e) => e.stopPropagation()} align="center" gap="xs" my="sm">
              <LocalIcon icon="gpp-maybe-outline-rounded" width="1rem" height="1rem" style={{ color: 'var(--primary-color, #3b82f6)' }} />
              <Text>Page Selection</Text>
              </Flex>
            </Tooltip>
        }
        onKeyDown={(e) => e.key === 'Enter' && onUpdatePagesFromCSV()}
        className={classes.textInput}
      />
    </Group>
  );
};

export default PageSelectionInput;
