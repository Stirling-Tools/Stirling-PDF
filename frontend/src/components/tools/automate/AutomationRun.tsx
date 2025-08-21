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
import { useFlatToolRegistry } from '../../../data/useTranslatedToolRegistry';
import { executeAutomationSequence } from '../../../utils/automationExecutor';

interface AutomationRunProps {
  automation: any;
  onBack: () => void;
  onComplete: () => void;
  automateOperation?: any; // Add the operation hook to store results
}

interface ExecutionStep {
  id: string;
  operation: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

export default function AutomationRun({ automation, onBack, onComplete, automateOperation }: AutomationRunProps) {
  const { t } = useTranslation();
  const { activeFiles, consumeFiles } = useFileContext();
  const toolRegistry = useFlatToolRegistry();
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [currentFiles, setCurrentFiles] = useState<File[]>([]);

  // Initialize execution steps from automation
  React.useEffect(() => {
    if (automation?.operations) {
      const steps = automation.operations.map((op: any, index: number) => {
        const tool = toolRegistry[op.operation];
        return {
          id: `${op.operation}-${index}`,
          operation: op.operation,
          name: tool?.name || op.operation,
          status: 'pending' as const
        };
      });
      setExecutionSteps(steps);
    }
    // Initialize current files with active files
    if (activeFiles) {
      setCurrentFiles([...activeFiles]);
    }
  }, [automation, toolRegistry, activeFiles]);

  const executeAutomation = async () => {
    if (!activeFiles || activeFiles.length === 0) {
      // Show error - need files to execute automation
      return;
    }

    setIsExecuting(true);
    setCurrentStepIndex(0);

    try {
      // Execute the automation sequence using the new executor
      const finalResults = await executeAutomationSequence(
        automation,
        activeFiles,
        (stepIndex: number, operationName: string) => {
          // Step started
          setCurrentStepIndex(stepIndex);
          setExecutionSteps(prev => prev.map((step, idx) =>
            idx === stepIndex ? { ...step, status: 'running' } : step
          ));
        },
        (stepIndex: number, resultFiles: File[]) => {
          // Step completed
          setExecutionSteps(prev => prev.map((step, idx) =>
            idx === stepIndex ? { ...step, status: 'completed' } : step
          ));
          setCurrentFiles(resultFiles);
        },
        (stepIndex: number, error: string) => {
          // Step failed
          setExecutionSteps(prev => prev.map((step, idx) =>
            idx === stepIndex ? { ...step, status: 'error', error } : step
          ));
        }
      );

      // All steps completed successfully
      setCurrentStepIndex(-1);
      setIsExecuting(false);
      setCurrentFiles(finalResults);

      // Properly integrate results with FileContext
      if (finalResults.length > 0) {
        console.log(`🎨 Integrating ${finalResults.length} result files with FileContext`);

        // Use FileContext's consumeFiles to properly add results
        // This replaces input files with output files (like other tools do)
        await consumeFiles(activeFiles, finalResults);

        console.log(`✅ Successfully integrated automation results with FileContext`);
      }

    } catch (error: any) {
      console.error('Automation execution failed:', error);
      setIsExecuting(false);
      setCurrentStepIndex(-1);
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
