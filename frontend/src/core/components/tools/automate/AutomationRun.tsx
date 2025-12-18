import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, Stack, Group, Card, Progress } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useFileSelection } from "@app/contexts/FileContext";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { AutomationConfig, ExecutionStep } from "@app/types/automation";
import { AUTOMATION_CONSTANTS, EXECUTION_STATUS } from "@app/constants/automation";
import { useResourceCleanup } from "@app/utils/resourceManager";

interface AutomationRunProps {
  automation: AutomationConfig;
  onComplete: () => void;
  automateOperation?: any; // TODO: Type this properly when available
}

export default function AutomationRun({ automation, onComplete, automateOperation }: AutomationRunProps) {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();
  const { regularTools } = useToolRegistry();
  const toolRegistry = regularTools;
  const cleanup = useResourceCleanup();

  // Progress tracking state
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);

  // Use the operation hook's loading state
  const isExecuting = automateOperation?.isLoading || false;
  const hasResults = automateOperation?.files.length > 0 || automateOperation?.downloadUrl !== null;

  // Initialize execution steps from automation
  useEffect(() => {
    if (automation?.operations) {
      const steps = automation.operations.map((op: any, index: number) => {
        const tool = toolRegistry[op.operation as keyof typeof toolRegistry];
        return {
          id: `${op.operation}-${index}`,
          operation: op.operation,
          name: tool?.name || op.operation,
          status: EXECUTION_STATUS.PENDING
        };
      });
      setExecutionSteps(steps);
      setCurrentStepIndex(-1);
    }
  }, [automation, toolRegistry]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Reset progress state when component unmounts
      setExecutionSteps([]);
      setCurrentStepIndex(-1);
      // Clean up any blob URLs
      cleanup();
    };
  }, [cleanup]);

  const executeAutomation = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    if (!automateOperation) {
      console.error('No automateOperation provided');
      return;
    }

    // Reset progress tracking
    setCurrentStepIndex(0);
    setExecutionSteps(prev => prev.map(step => ({ ...step, status: EXECUTION_STATUS.PENDING, error: undefined })));

    try {
      // Use the automateOperation.executeOperation to handle file consumption properly
      await automateOperation.executeOperation(
        {
          automationConfig: automation,
          onStepStart: (stepIndex: number, _operationName: string) => {
            setCurrentStepIndex(stepIndex);
            setExecutionSteps(prev => prev.map((step, idx) =>
              idx === stepIndex ? { ...step, status: EXECUTION_STATUS.RUNNING } : step
            ));
          },
          onStepComplete: (stepIndex: number, _resultFiles: File[]) => {
            setExecutionSteps(prev => prev.map((step, idx) =>
              idx === stepIndex ? { ...step, status: EXECUTION_STATUS.COMPLETED } : step
            ));
          },
          onStepError: (stepIndex: number, error: string) => {
            setExecutionSteps(prev => prev.map((step, idx) =>
              idx === stepIndex ? { ...step, status: EXECUTION_STATUS.ERROR, error } : step
            ));
          }
        },
        selectedFiles
      );

      // Mark all as completed and reset current step
      setCurrentStepIndex(-1);
      console.log(`✅ Automation completed successfully`);
    } catch (error: any) {
      console.error("Automation execution failed:", error);
      setCurrentStepIndex(-1);
    }
  };

  const getProgress = () => {
    if (executionSteps.length === 0) return 0;
    const completedSteps = executionSteps.filter(step => step.status === EXECUTION_STATUS.COMPLETED).length;
    return (completedSteps / executionSteps.length) * 100;
  };

  const getStepIcon = (step: ExecutionStep) => {
    switch (step.status) {
      case EXECUTION_STATUS.COMPLETED:
        return <LocalIcon icon="check-rounded" width={16} height={16} style={{ color: 'green' }} />;
      case EXECUTION_STATUS.ERROR:
        return <span style={{ fontSize: 16, color: 'red' }}>✕</span>;
      case EXECUTION_STATUS.RUNNING:
        return <div style={{
          width: 16,
          height: 16,
          border: '2px solid #ccc',
          borderTop: '2px solid #007bff',
          borderRadius: '50%',
          animation: `spin ${AUTOMATION_CONSTANTS.SPINNER_ANIMATION_DURATION} linear infinite`
        }} />;
      default:
        return <div style={{
          width: 16,
          height: 16,
          border: '2px solid #ccc',
          borderRadius: '50%'
        }} />;
    }
  };

  return (
    <div>
      <Stack gap="md">
        {/* Automation Info */}
        <Card padding="md" withBorder>
          <Text size="sm" fw={500} mb="xs">
            {automation?.name || t("automate.sequence.unnamed", "Unnamed Automation")}
          </Text>
          <Text size="xs" c="dimmed">
            {t("automate.sequence.steps", "{{count}} steps", { count: executionSteps.length })}
          </Text>
        </Card>

        {/* Progress Bar */}
        {isExecuting && (
          <div>
            <Text size="sm" mb="xs">
              Progress: {currentStepIndex + 1}/{executionSteps.length}
            </Text>
            <Progress value={getProgress()} size="lg" />
          </div>
        )}

        {/* Execution Steps */}
        <Stack gap="xs">
          {executionSteps.map((step, index) => (
            <Group key={step.id} gap="sm" align="center">
              <Text size="xs" c="dimmed" style={{ minWidth: "1rem", textAlign: "center" }}>
                {index + 1}
              </Text>

              {getStepIcon(step)}

              <div style={{ flex: 1 }}>
                <Text
                  size="sm"
                  style={{
                    color: step.status === EXECUTION_STATUS.RUNNING ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-text)',
                    fontWeight: step.status === EXECUTION_STATUS.RUNNING ? 500 : 400
                  }}
                >
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
            leftSection={<LocalIcon icon="play-arrow-rounded" width={24} height={24} />}
            onClick={executeAutomation}
            disabled={isExecuting || !selectedFiles || selectedFiles.length === 0}
            loading={isExecuting}
          >
            {isExecuting
              ? t("automate.sequence.running", "Running Automation...")
              : t("automate.sequence.run", "Run Automation")}
          </Button>

          {hasResults && (
            <Button variant="light" onClick={onComplete}>
              {t("automate.sequence.finish", "Finish")}
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
