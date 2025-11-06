import { Button, Text, Group, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import classes from '@app/components/pageEditor/bulkSelectionPanel/BulkSelectionPanel.module.css';
import { LogicalOperator } from '@app/utils/bulkselection/selectionBuilders';

interface OperatorsSectionProps {
  csvInput: string;
  onInsertOperator: (op: LogicalOperator) => void;
}

const OperatorsSection = ({ csvInput, onInsertOperator }: OperatorsSectionProps) => {
  const { t } = useTranslation();
  
  return (
    <div>
      <Text size="xs" c="var(--text-muted)" fw={500} mb="xs">{t('bulkSelection.keywords.title', 'Keywords')}:</Text>
      <Group gap="sm" wrap="nowrap">
        <Button 
          size="sm" 
          variant="outline"
          className={classes.operatorChip} 
          onClick={() => onInsertOperator('and')}
          disabled={!csvInput.trim()}
          title="Combine selections (both conditions must be true)"
        >
          <Text size="xs" fw={500}>and</Text>
        </Button>
        <Button 
          size="sm" 
          variant="outline"
          className={classes.operatorChip} 
          onClick={() => onInsertOperator('or')}
          disabled={!csvInput.trim()}
          title="Add to selection (either condition can be true)"
        >
          <Text size="xs" fw={500}>or</Text>
        </Button>
        <Button 
          size="sm" 
          variant="outline"
          className={classes.operatorChip} 
          onClick={() => onInsertOperator('not')}
          disabled={!csvInput.trim()}
          title="Exclude from selection"
        >
          <Text size="xs" fw={500}>not</Text>
        </Button>
      </Group>
      <Divider my="sm" />
      <Group gap="sm" wrap="nowrap">
        <Button 
          size="sm" 
          variant="outline"
          className={classes.operatorChip} 
          onClick={() => onInsertOperator('even')}
          title="Select all even-numbered pages (2, 4, 6, 8...)"
        >
          <Text size="xs" fw={500}>even</Text>
        </Button>
        <Button 
          size="sm" 
          variant="outline"
          className={classes.operatorChip} 
          onClick={() => onInsertOperator('odd')}
          title="Select all odd-numbered pages (1, 3, 5, 7...)"
        >
          <Text size="xs" fw={500}>odd</Text>
        </Button>
      </Group>
    </div>
  );
};

export default OperatorsSection;
