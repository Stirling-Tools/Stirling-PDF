import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  Stack,
  Group,
  Card,
  Progress,
  Loader,
  Tooltip,
} from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { useConnectedServer } from "@editor/hooks/useConnectedServer";
import { useViewScopedFiles } from "@editor/hooks/tools/shared/useViewScopedFiles";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import { AutomationConfig, ExecutionStep } from "@editor/types/automation";
import { EXECUTION_STATUS } from "@editor/constants/automation";
import { useResourceCleanup } from "@editor/utils/resourceManager";
import type { useAutomateOperation } from "@editor/hooks/tools/automate/useAutomateOperation";

interface AutomationRunProps {
  automation: AutomationConfig;
  onComplete: () => void;
  onEditCopy?: (automation: AutomationConfig) => void;
  automateOperation?: ReturnType<typeof useAutomateOperation>;
}

export default function AutomationRun({
  automation,
  onComplete,
  onEditCopy,
  automateOperation,
}: AutomationRunProps) {
  const { t } = useTranslation();
  const selectedFiles = useViewScopedFiles();
  const { regularTools } = useToolRegistry();
  const toolRegistry = regularTools;
  const cleanup = useResourceCleanup();

  // Progress tracking state
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);

  // Use the operation hook's loading state
  const isExecuting = automateOperation?.isLoading || false;
  const hasResults =
    (automateOperation?.files.length ?? 0) > 0 ||
    automateOperation?.downloadUrl !== null;

  // Automations execute on the connected server. True on web (server-backed); on desktop
  // it tracks the signed-in connection, so running waits until one exists.
  const connectedServer = useConnectedServer();
  const signInReason = connectedServer
    ? null
    : t("automate.sequence.signInToRun", "Sign in to run automations.");
  const hasFiles = (selectedFiles?.length ?? 0) > 0;
  const runDisabledReason =
    signInReason ??
    (hasFiles
      ? null
      : t(
          "automate.sequence.selectFiles",
          "Select at least one file to run this automation.",
        ));

  // Initialize execution steps from automation
  useEffect(() => {
    if (automation?.operations) {
      const steps = automation.operations.map((op, index) => {
        const tool = toolRegistry[op.operation as keyof typeof toolRegistry];
        return {
          id: `${op.operation}-${index}`,
          operation: op.operation,
          name: tool?.name || op.operation,
          status: EXECUTION_STATUS.PENDING,
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
      console.error("No automateOperation provided");
      return;
    }

    // Reset progress tracking
    setCurrentStepIndex(0);
    setExecutionSteps((prev) =>
      prev.map((step) => ({
        ...step,
        status: EXECUTION_STATUS.PENDING,
        error: undefined,
      })),
    );

    try {
      // Use the automateOperation.executeOperation to handle file consumption properly
      await automateOperation.executeOperation(
        {
          automationConfig: automation,
          onStepStart: (stepIndex: number, _operationName: string) => {
            setCurrentStepIndex(stepIndex);
            setExecutionSteps((prev) =>
              prev.map((step, idx) =>
                idx === stepIndex
                  ? { ...step, status: EXECUTION_STATUS.RUNNING }
                  : step,
              ),
            );
          },
          onStepComplete: (stepIndex: number, _resultFiles: File[]) => {
            setExecutionSteps((prev) =>
              prev.map((step, idx) =>
                idx === stepIndex
                  ? { ...step, status: EXECUTION_STATUS.COMPLETED }
                  : step,
              ),
            );
          },
          onStepError: (stepIndex: number, error: string) => {
            setExecutionSteps((prev) =>
              prev.map((step, idx) =>
                idx === stepIndex
                  ? { ...step, status: EXECUTION_STATUS.ERROR, error }
                  : step,
              ),
            );
          },
        },
        selectedFiles,
      );

      // Mark all as completed and reset current step
      setCurrentStepIndex(-1);
      console.log(`✅ Automation completed successfully`);
    } catch (error: unknown) {
      console.error("Automation execution failed:", error);
      setCurrentStepIndex(-1);
    }
  };

  const getProgress = () => {
    if (executionSteps.length === 0) return 0;
    const completedSteps = executionSteps.filter(
      (step) => step.status === EXECUTION_STATUS.COMPLETED,
    ).length;
    return (completedSteps / executionSteps.length) * 100;
  };

  const getStepIcon = (step: ExecutionStep) => {
    switch (step.status) {
      case EXECUTION_STATUS.COMPLETED:
        return (
          <Icon name="check" size={16} style={{ color: "var(--c-success)" }} />
        );
      case EXECUTION_STATUS.ERROR:
        return (
          <span style={{ fontSize: 16, color: "var(--c-danger)" }}>✕</span>
        );
      case EXECUTION_STATUS.RUNNING:
        return <Loader size={16} />;
      default:
        return (
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid var(--c-border)",
              borderRadius: "50%",
            }}
          />
        );
    }
  };

  return (
    <div>
      <Stack gap="md">
        {/* Automation Info */}
        <Card padding="md" withBorder>
          <Text size="sm" fw={500} mb="xs">
            {automation?.name ||
              t("automate.sequence.unnamed", "Unnamed Automation")}
          </Text>
          {automation?.description && (
            <Text size="xs" c="dimmed" mb="xs">
              {automation.description}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {t("automate.sequence.steps", "{{count}} steps", {
              count: executionSteps.length,
            })}
          </Text>
        </Card>

        {/* Progress Bar */}
        {isExecuting && (
          <div>
            <Text size="sm" mb="xs">
              {t("automate.run.progress", "Progress: {{current}}/{{total}}", {
                current: currentStepIndex + 1,
                total: executionSteps.length,
              })}
            </Text>
            <Progress value={getProgress()} size="lg" />
          </div>
        )}

        {/* Execution Steps */}
        <Stack gap="xs">
          {executionSteps.map((step, index) => (
            <Group key={step.id} gap="sm" align="center">
              <Text
                size="xs"
                c="dimmed"
                style={{ minWidth: "1rem", textAlign: "center" }}
              >
                {index + 1}
              </Text>

              {getStepIcon(step)}

              <div style={{ flex: 1 }}>
                <Text
                  size="sm"
                  style={{
                    color:
                      step.status === EXECUTION_STATUS.RUNNING
                        ? "var(--c-accent-fg, var(--c-primary))"
                        : "var(--c-text)",
                    fontWeight:
                      step.status === EXECUTION_STATUS.RUNNING ? 500 : 400,
                  }}
                >
                  {step.name}
                </Text>
                {step.error && (
                  <Text size="xs" c="var(--c-danger)" mt="xs">
                    {step.error}
                  </Text>
                )}
              </div>
            </Group>
          ))}
        </Stack>

        {/* Action Buttons */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 2,
            background: "var(--c-bg-raised)",
            paddingTop: "var(--mantine-spacing-sm)",
            borderTop: "1px solid var(--c-border-subtle)",
          }}
        >
          <Stack gap="sm">
            <Tooltip
              label={runDisabledReason}
              disabled={!runDisabledReason}
              withArrow
            >
              {/* Wrapper keeps the tooltip reachable while the button is disabled. */}
              <span style={{ display: "block" }}>
                <Button
                  leftSection={<Icon name="play" />}
                  onClick={executeAutomation}
                  disabled={isExecuting || !hasFiles || Boolean(signInReason)}
                  loading={isExecuting}
                  fullWidth
                >
                  {isExecuting
                    ? t("automate.sequence.running", "Running Automation...")
                    : t("automate.sequence.run", "Run Automation")}
                </Button>
              </span>
            </Tooltip>

            {hasResults && (
              <Button variant="secondary" onClick={onComplete} fullWidth>
                {t("automate.sequence.finish", "Finish")}
              </Button>
            )}

            {onEditCopy && (
              <Button
                variant="secondary"
                leftSection={<Icon name="pencil" />}
                onClick={() => onEditCopy(automation)}
                fullWidth
              >
                {t("automate.sequence.editCopy", "Edit a copy")}
              </Button>
            )}
          </Stack>
        </div>
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
