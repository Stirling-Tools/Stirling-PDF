import { TextInput, Button, Text, Flex, Switch } from '@mantine/core';
import LocalIcon from '../../shared/LocalIcon';
import { Tooltip } from '../../shared/Tooltip';
import { usePageSelectionTips } from '../../tooltips/usePageSelectionTips';
import classes from './BulkSelectionPanel.module.css';

interface PageSelectionInputProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  onUpdatePagesFromCSV: (override?: string) => void;
  onClear: () => void;
  advancedOpened?: boolean;
  onToggleAdvanced?: (v: boolean) => void;
}

const PageSelectionInput = ({
  csvInput,
  setCsvInput,
  onUpdatePagesFromCSV,
  onClear,
  advancedOpened,
  onToggleAdvanced,
}: PageSelectionInputProps) => {
  const pageSelectionTips = usePageSelectionTips();

  return (
    <div className={classes.panelGroup}>
      {/* Header row with tooltip/title and advanced toggle */}
      <Flex justify="space-between" align="center" mb="sm">
        <Tooltip
          position="left"
          offset={20}
          header={pageSelectionTips.header}
          portalTarget={document.body}
          pinOnClick={true}
          containerStyle={{ marginTop: "1rem"}}
          tips={pageSelectionTips.tips}
        >
          <Flex onClick={(e) => e.stopPropagation()} align="center" gap="xs">
            <LocalIcon icon="gpp-maybe-outline-rounded" width="1rem" height="1rem" style={{ color: 'var(--text-instruction)' }} />
            <Text>Page Selection</Text>
          </Flex>
        </Tooltip>
        {typeof advancedOpened === 'boolean' && (
          <Flex align="center" gap="xs">
            <Text size="sm" c="var(--text-secondary)">Advanced</Text>
            <Switch
              size="sm"
              checked={!!advancedOpened}
              onChange={(e) => onToggleAdvanced?.(e.currentTarget.checked)}
              title="Advanced"
              className={classes.advancedSwitch}
            />
          </Flex>
        )}
      </Flex>
      
      {/* Text input */}
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
                color: 'var(--text-muted)',
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
        onKeyDown={(e) => e.key === 'Enter' && onUpdatePagesFromCSV()}
        className={classes.textInput}
      />
    </div>
  );
};

export default PageSelectionInput;
