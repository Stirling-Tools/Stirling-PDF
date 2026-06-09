import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import {
  getToolSupportsAutomate,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import type { AutomationConfig } from "@app/types/automation";
import type {
  RecordedOperationStep,
  RecorderSkipReason,
  WorkflowRecorderDraft,
  WorkflowRecorderEvent,
} from "@app/types/workflowRecorder";
import { serializeWorkflowParameters } from "@app/utils/workflowRecorderSerializer";
import {
  initialWorkflowRecorderState,
  workflowRecorderReducer,
} from "@app/contexts/workflowRecorder/workflowRecorderReducer";

interface WorkflowRecorderContextValue {
  isRecording: boolean;
  draft: WorkflowRecorderDraft | null;
  recordableSteps: RecordedOperationStep[];
  skippedSteps: RecordedOperationStep[];
  startRecording: () => void;
  stopRecording: () => void;
  discardRecording: () => void;
  removeStep: (stepId: string) => void;
  recordCompletedOperation: (event: WorkflowRecorderEvent) => void;
  buildAutomationConfig: () => AutomationConfig | null;
}

const WorkflowRecorderContext = createContext<
  WorkflowRecorderContextValue | undefined
>(undefined);

function createDraft(): WorkflowRecorderDraft {
  const timestamp = new Date().toISOString();
  return {
    id: `workflow-recording-${Date.now()}`,
    name: "Recorded Workflow",
    description: "Created from a recorded multi-tool session.",
    icon: "SettingsIcon",
    startedAt: timestamp,
    updatedAt: timestamp,
    steps: [],
  };
}

function createStepId(operation: string): string {
  return `recorded-${operation}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getSkipReason(
  operationType: string,
  toolEntry: ToolRegistryEntry | undefined,
): RecorderSkipReason | null {
  if (operationType === "automate") {
    return "nestedAutomation";
  }
  if (!toolEntry) {
    return "toolNotInRegistry";
  }
  if (!getToolSupportsAutomate(toolEntry)) {
    return "toolDoesNotSupportAutomate";
  }
  if (!toolEntry.operationConfig) {
    return "missingOperationConfig";
  }
  return null;
}

export function WorkflowRecorderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(
    workflowRecorderReducer,
    initialWorkflowRecorderState,
  );
  const { allTools } = useToolRegistry();

  const startRecording = useCallback(() => {
    dispatch({ type: "START_RECORDING", payload: createDraft() });
  }, []);

  const stopRecording = useCallback(() => {
    dispatch({ type: "STOP_RECORDING" });
  }, []);

  const discardRecording = useCallback(() => {
    dispatch({ type: "DISCARD_RECORDING" });
  }, []);

  const removeStep = useCallback((stepId: string) => {
    dispatch({ type: "REMOVE_STEP", payload: stepId });
  }, []);

  const recordCompletedOperation = useCallback(
    (event: WorkflowRecorderEvent) => {
      if (!state.isRecording) {
        return;
      }

      const capturedAt = new Date().toISOString();
      const toolEntry = allTools[event.operationType];
      const skipReason = getSkipReason(event.operationType, toolEntry);
      const serialized = serializeWorkflowParameters(event.parameters);

      const parameterSkipReason: RecorderSkipReason | undefined =
        serialized.hasSensitiveFields
          ? "sensitiveParameters"
          : serialized.hasNonSerializableFields
            ? "nonSerializableParameters"
            : undefined;

      const step: RecordedOperationStep = {
        id: createStepId(event.operationType),
        operation: event.operationType,
        toolName: toolEntry?.name ?? event.operationType,
        parameters: serialized.parameters,
        status: skipReason
          ? "skipped"
          : parameterSkipReason
            ? "incomplete"
            : "recorded",
        skipReason: skipReason ?? parameterSkipReason,
        capturedAt,
        inputCount: event.inputCount,
        outputCount: event.outputCount,
        endpoint: event.endpoint,
      };

      dispatch({ type: "ADD_STEP", payload: step });
    },
    [allTools, state.isRecording],
  );

  const recordableSteps = useMemo(
    () => state.draft?.steps.filter((step) => step.status === "recorded") ?? [],
    [state.draft],
  );

  const skippedSteps = useMemo(
    () => state.draft?.steps.filter((step) => step.status !== "recorded") ?? [],
    [state.draft],
  );

  const buildAutomationConfig = useCallback((): AutomationConfig | null => {
    if (!state.draft || recordableSteps.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString();
    return {
      id: `${state.draft.id}-preview`,
      name: state.draft.name,
      description: state.draft.description,
      icon: state.draft.icon,
      operations: recordableSteps.map((step) => ({
        operation: step.operation,
        parameters: step.parameters,
      })),
      createdAt: state.draft.startedAt,
      updatedAt: timestamp,
    };
  }, [recordableSteps, state.draft]);

  const value = useMemo<WorkflowRecorderContextValue>(
    () => ({
      isRecording: state.isRecording,
      draft: state.draft,
      recordableSteps,
      skippedSteps,
      startRecording,
      stopRecording,
      discardRecording,
      removeStep,
      recordCompletedOperation,
      buildAutomationConfig,
    }),
    [
      state.isRecording,
      state.draft,
      recordableSteps,
      skippedSteps,
      startRecording,
      stopRecording,
      discardRecording,
      removeStep,
      recordCompletedOperation,
      buildAutomationConfig,
    ],
  );

  return (
    <WorkflowRecorderContext.Provider value={value}>
      {children}
    </WorkflowRecorderContext.Provider>
  );
}

export function useWorkflowRecorder(): WorkflowRecorderContextValue {
  const context = useContext(WorkflowRecorderContext);
  if (!context) {
    throw new Error(
      "useWorkflowRecorder must be used within a WorkflowRecorderProvider",
    );
  }
  return context;
}

export function useOptionalWorkflowRecorder():
  | WorkflowRecorderContextValue
  | undefined {
  return useContext(WorkflowRecorderContext);
}
