import { useCallback, useMemo, useState } from "react";
import {
  AutomationConfig,
  AutomationMode,
  AutomationOperation,
  AutomationTool,
} from "@editor/types/automation";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import type { ToolId } from "@editor/types/toolId";
import {
  defaultParametersFor,
  isStepReady,
} from "@editor/components/tools/automate/stepSummary";

interface UseAutomationFormProps {
  mode: AutomationMode;
  existingAutomation?: AutomationConfig;
  toolRegistry: Partial<ToolRegistry>;
}

/** Why Save is unavailable, in the order the user should fix it. */
export type SaveBlocker =
  | { kind: "name" }
  | { kind: "noSteps" }
  | { kind: "stepNoTool"; index: number }
  | { kind: "stepNeedsConfiguration"; index: number };

interface FormSnapshot {
  name: string;
  description: string;
  icon: string;
  steps: AutomationTool[];
}

let stepIdCounter = 0;
function newStepId(): string {
  stepIdCounter += 1;
  return `step-${Date.now()}-${stepIdCounter}`;
}

function emptyStep(): AutomationTool {
  return { id: newStepId(), operation: "", parameters: {} };
}

function buildInitialSnapshot(
  mode: AutomationMode,
  existingAutomation: AutomationConfig | undefined,
  toolRegistry: Partial<ToolRegistry>,
): FormSnapshot {
  if (mode === AutomationMode.CREATE || !existingAutomation) {
    return {
      name: "",
      description: "",
      // A saved entry always carries a valid icon key, so the picker and the
      // saved row agree on what the user chose.
      icon: "SettingsIcon",
      steps: [emptyStep()],
    };
  }
  return {
    name: existingAutomation.name || "",
    description: existingAutomation.description || "",
    icon: existingAutomation.icon || "SettingsIcon",
    steps: (existingAutomation.operations || []).map((op) => {
      const operation = typeof op === "string" ? op : op.operation;
      const saved = typeof op === "object" ? op.parameters || {} : {};
      return {
        id: newStepId(),
        operation,
        parameters: {
          ...defaultParametersFor(toolRegistry, operation),
          ...saved,
        },
      };
    }),
  };
}

function hasSettings(
  toolRegistry: Partial<ToolRegistry>,
  operation: string,
): boolean {
  return Boolean(toolRegistry[operation as ToolId]?.automationSettings);
}

/** A saved automation was already configured by whoever saved it; a suggestion was not. */
function initialUnconfigured(
  mode: AutomationMode,
  steps: AutomationTool[],
  toolRegistry: Partial<ToolRegistry>,
): ReadonlySet<string> {
  if (mode === AutomationMode.EDIT) return new Set();
  return new Set(
    steps
      .filter((step) => hasSettings(toolRegistry, step.operation))
      .map((step) => step.id),
  );
}

function toOperations(steps: AutomationTool[]): AutomationOperation[] {
  return steps
    .filter((step) => step.operation !== "")
    .map((step) => ({
      operation: step.operation,
      parameters: step.parameters || {},
    }));
}

function comparable(snapshot: FormSnapshot): string {
  return JSON.stringify({
    name: snapshot.name.trim(),
    description: snapshot.description.trim(),
    icon: snapshot.icon,
    operations: toOperations(snapshot.steps),
  });
}

/**
 * Builder form state. Seeded once on mount from `existingAutomation`, so the
 * caller remounts (keys) the builder to start a new session. Empty step slots
 * are dropped on save rather than blocking it.
 */
export function useAutomationForm({
  mode,
  existingAutomation,
  toolRegistry,
}: UseAutomationFormProps) {
  const [initial] = useState(() =>
    buildInitialSnapshot(mode, existingAutomation, toolRegistry),
  );
  const [automationName, setAutomationName] = useState(initial.name);
  const [automationDescription, setAutomationDescription] = useState(
    initial.description,
  );
  const [automationIcon, setAutomationIcon] = useState(initial.icon);
  const [steps, setSteps] = useState<AutomationTool[]>(initial.steps);
  // Steps whose tool "Change tool" cleared. Unlike a fresh slot, which is dropped
  // on save, these block saving until a tool is picked or the step is removed,
  // so a configured step is never lost silently.
  const [clearedStepIds, setClearedStepIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Steps whose settings the user has not yet confirmed with Done. Defaults are
  // not assumed to suit the user's files, so each tool with settings is
  // reviewed once before the automation can be saved.
  const [unconfiguredStepIds, setUnconfiguredStepIds] = useState<
    ReadonlySet<string>
  >(() => initialUnconfigured(mode, initial.steps, toolRegistry));

  const addStep = useCallback((): string => {
    const step = emptyStep();
    setSteps((prev) => [...prev, step]);
    return step.id;
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveStep = useCallback((index: number, delta: -1 | 1) => {
    setSteps((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const setStepTool = useCallback(
    (index: number, operation: string) => {
      const id = steps[index]?.id;
      if (id) {
        setUnconfiguredStepIds((prev) => {
          const next = new Set(prev);
          if (hasSettings(toolRegistry, operation)) next.add(id);
          else next.delete(id);
          return next;
        });
      }
      setSteps((prev) =>
        prev.map((step, i) =>
          i === index
            ? {
                ...step,
                operation,
                parameters: defaultParametersFor(toolRegistry, operation),
              }
            : step,
        ),
      );
    },
    [steps, toolRegistry],
  );

  const markStepConfigured = useCallback((stepId: string) => {
    setUnconfiguredStepIds((prev) => {
      if (!prev.has(stepId)) return prev;
      const next = new Set(prev);
      next.delete(stepId);
      return next;
    });
  }, []);

  const setStepParameter = useCallback(
    (index: number, key: string, value: unknown) => {
      setSteps((prev) =>
        prev.map((step, i) =>
          i === index
            ? {
                ...step,
                parameters: { ...(step.parameters ?? {}), [key]: value },
              }
            : step,
        ),
      );
    },
    [],
  );

  const clearStepTool = useCallback(
    (index: number) => {
      const id = steps[index]?.id;
      if (id) setClearedStepIds((prev) => new Set(prev).add(id));
      setSteps((prev) =>
        prev.map((step, i) =>
          i === index ? { ...step, operation: "", parameters: {} } : step,
        ),
      );
    },
    [steps],
  );

  const stepReady = useCallback(
    (step: AutomationTool) =>
      !unconfiguredStepIds.has(step.id) &&
      isStepReady(toolRegistry, step.operation, step.parameters),
    [toolRegistry, unconfiguredStepIds],
  );

  const saveBlocker = useMemo((): SaveBlocker | null => {
    if (automationName.trim() === "") return { kind: "name" };
    const clearedIndex = steps.findIndex(
      (step) => step.operation === "" && clearedStepIds.has(step.id),
    );
    if (clearedIndex >= 0) return { kind: "stepNoTool", index: clearedIndex };
    if (!steps.some((step) => step.operation !== "")) {
      return { kind: "noSteps" };
    }
    const index = steps.findIndex(
      (step) => step.operation !== "" && !stepReady(step),
    );
    if (index >= 0) return { kind: "stepNeedsConfiguration", index };
    return null;
  }, [automationName, steps, stepReady, clearedStepIds]);

  const isDirty = useMemo(
    () =>
      comparable({
        name: automationName,
        description: automationDescription,
        icon: automationIcon,
        steps,
      }) !== comparable(initial),
    [automationName, automationDescription, automationIcon, steps, initial],
  );

  const buildAutomationData = useCallback(
    () => ({
      name: automationName.trim(),
      description: automationDescription.trim(),
      icon: automationIcon,
      operations: toOperations(steps),
    }),
    [automationName, automationDescription, automationIcon, steps],
  );

  return {
    automationName,
    setAutomationName,
    automationDescription,
    setAutomationDescription,
    automationIcon,
    setAutomationIcon,
    steps,
    addStep,
    removeStep,
    moveStep,
    setStepTool,
    setStepParameter,
    markStepConfigured,
    clearStepTool,
    stepReady,
    saveBlocker,
    isDirty,
    buildAutomationData,
  };
}
