import { Button, Text, Group } from '@mantine/core';
import classes from './BulkSelectionPanel.module.css';

interface OperatorsSectionProps {
  csvInput: string;
  onInsertOperator: (op: 'and' | 'or' | 'not') => void;
}

const OperatorsSection = ({ csvInput, onInsertOperator }: OperatorsSectionProps) => {
  return (
    <div>
      <Text size="xs" c="var(--text-muted)" fw={500} mb="xs">Add Operators:</Text>
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
    </div>
  );
};

export default OperatorsSection;
