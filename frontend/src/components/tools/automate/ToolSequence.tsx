import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Button, 
  Text, 
  Title, 
  Stack, 
  Group, 
  ActionIcon,
  Progress,
  Card,
  Alert
} from '@mantine/core';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import ErrorIcon from '@mui/icons-material/Error';
import { useFileContext } from '../../../contexts/FileContext';

interface ToolSequenceProps {
  automation: any;
  onBack: () => void;
  onComplete: () => void;
}

interface ExecutionStep {
  id: string;
  operation: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

export default function ToolSequence({ automation, onBack, onComplete }: ToolSequenceProps) {
  const { t } = useTranslation();
  const { activeFiles } = useFileContext();
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);

  // Initialize execution steps from automation
  React.useEffect(() => {
    if (automation?.operations) {
      const steps = automation.operations.map((op: any, index: number) => ({
        id: `${op.operation}-${index}`,
        operation: op.operation,
        name: op.operation, // You might want to get the display name from tool registry
        status: 'pending' as const
      }));
      setExecutionSteps(steps);
    }
  }, [automation]);

  const executeAutomation = async () => {
    if (!activeFiles || activeFiles.length === 0) {
      // Show error - need files to execute automation
      return;
    }

    setIsExecuting(true);
    setCurrentStepIndex(0);

    try {
      for (let i = 0; i < executionSteps.length; i++) {
        setCurrentStepIndex(i);
        
        // Update step status to running
        setExecutionSteps(prev => prev.map((step, idx) => 
          idx === i ? { ...step, status: 'running' } : step
        ));

        // Simulate step execution (replace with actual tool execution)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Update step status to completed
        setExecutionSteps(prev => prev.map((step, idx) => 
          idx === i ? { ...step, status: 'completed' } : step
        ));
      }

      setCurrentStepIndex(-1);
      setIsExecuting(false);
      
      // All steps completed - show success
    } catch (error) {
      // Handle error
      setExecutionSteps(prev => prev.map((step, idx) => 
        idx === currentStepIndex ? { ...step, status: 'error', error: error?.toString() } : step
      ));
      setIsExecuting(false);
    }
  };

  const getStepIcon = (step: ExecutionStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckIcon style={{ fontSize: 16, color: 'green' }} />;
      case 'error':
        return <ErrorIcon style={{ fontSize: 16, color: 'red' }} />;
      case 'running':
        return <div style={{ width: 16, height: 16, border: '2px solid #ccc', borderTop: '2px solid #007bff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />;
      default:
        return <div style={{ width: 16, height: 16, border: '2px solid #ccc', borderRadius: '50%' }} />;
    }
  };

  const getProgress = () => {
    const completedSteps = executionSteps.filter(step => step.status === 'completed').length;
    return (completedSteps / executionSteps.length) * 100;
  };

  const allStepsCompleted = executionSteps.every(step => step.status === 'completed');
  const hasErrors = executionSteps.some(step => step.status === 'error');

  return (
    <div>
      <Group justify="space-between" align="center" mb="md">
        <Title order={3} size="h4" fw={600} style={{ color: 'var(--mantine-color-text)' }}>
          {t('automate.sequence.title', 'Tool Sequence')}
        </Title>
        <ActionIcon variant="subtle" onClick={onBack}>
          <ArrowBackIcon />
        </ActionIcon>
      </Group>

      <Stack gap="md">
        {/* Automation Info */}
        <Card padding="md" withBorder>
          <Text size="sm" fw={500} mb="xs">
            {automation?.name || t('automate.sequence.unnamed', 'Unnamed Automation')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('automate.sequence.steps', '{{count}} steps', { count: executionSteps.length })}
          </Text>
        </Card>

        {/* File Selection Warning */}
        {(!activeFiles || activeFiles.length === 0) && (
          <Alert color="orange" title={t('automate.sequence.noFiles', 'No Files Selected')}>
            {t('automate.sequence.noFilesDesc', 'Please select files to process before running the automation.')}
          </Alert>
        )}

        {/* Progress Bar */}
        {isExecuting && (
          <div>
            <Text size="sm" mb="xs">
              {t('automate.sequence.progress', 'Progress: {{current}}/{{total}}', { 
                current: currentStepIndex + 1, 
                total: executionSteps.length 
              })}
            </Text>
            <Progress value={getProgress()} size="lg" />
          </div>
        )}

        {/* Execution Steps */}
        <Stack gap="xs">
          {executionSteps.map((step, index) => (
            <Group key={step.id} gap="sm" align="center">
              <Text size="xs" c="dimmed" style={{ minWidth: '1rem', textAlign: 'center' }}>
                {index + 1}
              </Text>
              
              {getStepIcon(step)}
              
              <div style={{ flex: 1 }}>
                <Text size="sm" style={{ 
                  color: step.status === 'running' ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-text)',
                  fontWeight: step.status === 'running' ? 500 : 400
                }}>
                  {step.name}
                </Text>
                {step.error && (
                  <Text size="xs" c="red" mt="xs">
                    {step.error}
                  </Text>
                )}
              </div>
            </Group>
          ))}
        </Stack>

        {/* Action Buttons */}
        <Group justify="space-between" mt="xl">
          <Button
            leftSection={<PlayArrowIcon />}
            onClick={executeAutomation}
            disabled={isExecuting || !activeFiles || activeFiles.length === 0}
            loading={isExecuting}
          >
            {isExecuting 
              ? t('automate.sequence.running', 'Running Automation...') 
              : t('automate.sequence.run', 'Run Automation')
            }
          </Button>

          {(allStepsCompleted || hasErrors) && (
            <Button
              variant="light"
              onClick={onComplete}
            >
              {t('automate.sequence.finish', 'Finish')}
            </Button>
          )}
        </Group>
      </Stack>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}