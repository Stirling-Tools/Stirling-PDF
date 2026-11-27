import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Loader, Text, VisuallyHidden } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { useFilesModalContext } from "@editor/contexts/FilesModalContext";
import { useConnectedServer } from "@editor/hooks/useConnectedServer";
import { useViewScopedFiles } from "@editor/hooks/tools/shared/useViewScopedFiles";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import { AutomationConfig, ExecutionStep } from "@editor/types/automation";
import { EXECUTION_STATUS } from "@editor/constants/automation";
import { useResourceCleanup } from "@editor/utils/resourceManager";
import type { useAutomateOperation } from "@editor/hooks/tools/automate/useAutomateOperation";
import { createFilesToolStep } from "@editor/components/tools/shared/FilesToolStep";
import { createReviewToolStep } from "@editor/components/tools/shared/ReviewToolStep";
import AutomatePanelHeader from "@editor/components/tools/automate/AutomatePanelHeader";
import AutomationActionsMenu, {
  type AutomationAction,
} from "@editor/components/tools/automate/AutomationActionsMenu";
import AutomationStepCard, {
  StepConnector,
} from "@editor/components/tools/automate/AutomationStepCard";
import { toolDisplayName } from "@editor/components/tools/automate/stepSummary";
import { toolParamsNeedConfiguring } from "@editor/hooks/tools/shared/toolAutomation";
import type { ToolId } from "@editor/types/toolId";
import classes from "@editor/components/tools/automate/Automate.module.css";

interface AutomationRunProps {
  automation: AutomationConfig;
  automateOperation: ReturnType<typeof useAutomateOperation>;
  /** The header menu: the same actions the automation's library row offers. */
  actions: AutomationAction[];
  /** The visible edit entry point: Edit for a saved automation, Customize for a suggestion. */
  editAction: { label: string; icon: IconName; onClick: () => void };
  /** Told when a run starts and when it settles, including the wait before it begins. */
  onRunningChange?: (running: boolean) => void;
  /** Offered after a successful run; omitted where the Processor cannot take this automation. */
  onRunOnFolder?: () => void;
  onBack: () => void;
  onDone: () => void;
  /** Opens the builder on a step, offered when that step fails. */
  onEditStep: (index: number) => void;
  onFileClick: (file: File) => void;
  onUndo: () => void | Promise<void>;
}

function initialSteps(automation: AutomationConfig): ExecutionStep[] {
  return automation.operations.map((op, index) => ({
    id: `${op.operation}-${index}`,
    operation: op.operation,
    name: op.operation,
    status: EXECUTION_STATUS.PENDING,
  }));
}

const asContent = (_title: string, _props: unknown, content?: ReactNode) => (
  <>{content}</>
);

/**
 * The working area for one automation: what it will do, the files it will run
 * on, the run itself, and the results, all in place. Reuses the shared Files
 * and Review step bodies so selection and result handling match every other
 * tool; only their accordion chrome is dropped.
 */
export default function AutomationRun({
  automation,
  automateOperation,
  actions,
  editAction,
  onRunOnFolder,
  onRunningChange,
  onBack,
  onDone,
  onEditStep,
  onFileClick,
  onUndo,
}: AutomationRunProps) {
  const { t } = useTranslation();
  const selectedFiles = useViewScopedFiles();
  const { regularTools: toolRegistry } = useToolRegistry();
  const cleanup = useResourceCleanup();
  const { openFilesModal } = useFilesModalContext();

  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>(() =>
    initialSteps(automation),
  );

  // Held for the whole call: on desktop the operation waits for the backend
  // before it sets isLoading, and leaving in that window would let this run's
  // results land in another automation's workspace.
  const [isStarting, setIsStarting] = useState(false);
  const isExecuting = automateOperation.isLoading || isStarting;
  useEffect(() => {
    onRunningChange?.(isExecuting);
  }, [isExecuting, onRunningChange]);
  // The operation publishes its files before it swaps them into the workspace and
  // records Undo, so results count only once loading has ended without an error:
  // a failure after that point (preparing the download) leaves files but no Undo.
  // A failed Undo keeps its results on purpose, so it can be retried; only a
  // run's own error hides them.
  const [undoTried, setUndoTried] = useState(false);
  const hasResults =
    !isExecuting &&
    (!automateOperation.errorMessage || undoTried) &&
    (automateOperation.files.length > 0 ||
      automateOperation.downloadUrl !== null);
  const [isUndoing, setIsUndoing] = useState(false);
  const hasFiles = selectedFiles.length > 0;

  // Automations execute on the connected server. True on web (server-backed); on desktop
  // it tracks the signed-in connection, so running waits until one exists.
  const connectedServer = useConnectedServer();
  const signInReason = connectedServer
    ? null
    : t("automate.sequence.signInToRun", "Sign in to run automations.");

  // A saved, imported or suggested automation can hold settings its tool no longer
  // accepts; running it would only fail at the server, so it is blocked here instead.
  const stepsNeedingConfiguration = useMemo(
    () =>
      new Set(
        automation.operations.flatMap((op, index) =>
          toolParamsNeedConfiguring(
            op.operation as ToolId,
            op.parameters ?? {},
            toolRegistry,
          )
            ? [index]
            : [],
        ),
      ),
    [automation, toolRegistry],
  );
  const runBlockedReason =
    signInReason ??
    (stepsNeedingConfiguration.size > 0
      ? t(
          "automate.sequence.needsConfiguring",
          "Edit this automation to finish configuring its steps.",
        )
      : null);

  useEffect(() => {
    setExecutionSteps(initialSteps(automation));
  }, [automation]);

  useEffect(() => cleanup, [cleanup]);

  const setStepStatus = (
    stepIndex: number,
    status: ExecutionStep["status"],
    error?: string,
  ) =>
    setExecutionSteps((prev) =>
      prev.map((step, idx) =>
        idx === stepIndex ? { ...step, status, error } : step,
      ),
    );

  // Undo resets the results once it has restored the inputs; a run started in
  // that window would lose its results to that reset.
  const undo = async () => {
    setIsUndoing(true);
    setUndoTried(true);
    focusRunAfterUndo.current = true;
    try {
      await onUndo();
    } finally {
      setIsUndoing(false);
    }
  };

  // The control that had focus unmounts or is disabled at each turn of a run:
  // the run button when results or a failure arrive, Undo once it has restored
  // the inputs. Focus moves to what replaced it rather than falling to the page.
  const summaryRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const runErrorRef = useRef<HTMLParagraphElement>(null);
  const focusRunAfterUndo = useRef(false);
  const hadResultsRef = useRef(hasResults);
  const hadFailedStepRef = useRef(false);

  // Each step's start and finish, for the polite live region below; a step's
  // failure is announced by its own alert instead.
  const [announcement, setAnnouncement] = useState("");
  // A step's finish and the next step's start arrive back to back and can land
  // in one render; the second then joins the first instead of replacing it
  // before it is announced.
  const announcedThisRender = useRef(false);
  useEffect(() => {
    announcedThisRender.current = false;
  }, [announcement]);
  const announce = (text: string) => {
    const join = announcedThisRender.current;
    announcedThisRender.current = true;
    setAnnouncement((previous) => (join ? `${previous} ${text}` : text));
  };
  const announcementValues = (stepIndex: number) => ({
    current: stepIndex + 1,
    total: automation.operations.length,
    tool: toolDisplayName(
      t,
      toolRegistry,
      automation.operations[stepIndex]?.operation ?? "",
    ),
  });

  const executeAutomation = async () => {
    if (!hasFiles) return;
    setExecutionSteps(initialSteps(automation));
    automateOperation.clearError();
    setUndoTried(false);
    focusRunAfterUndo.current = false;
    // A failed run can leave files with no Undo record; drop them now, so a
    // start that fails before the operation resets its own state cannot bring
    // them back as results.
    automateOperation.resetResults();
    setIsStarting(true);
    // Synchronously, not only from the effect, so a Duplicate settling in the
    // same tick already sees the run.
    onRunningChange?.(true);
    try {
      await automateOperation.executeOperation(
        {
          automationConfig: automation,
          onStepStart: (stepIndex) => {
            setStepStatus(stepIndex, EXECUTION_STATUS.RUNNING);
            announce(
              t(
                "automate.run.progressStep",
                "Running step {{current}} of {{total}}: {{tool}}",
                announcementValues(stepIndex),
              ),
            );
          },
          onStepComplete: (stepIndex) => {
            setStepStatus(stepIndex, EXECUTION_STATUS.COMPLETED);
            announce(
              t(
                "automate.run.stepDone",
                "Step {{current}} of {{total}} done: {{tool}}",
                announcementValues(stepIndex),
              ),
            );
          },
          onStepError: (stepIndex, error) =>
            setStepStatus(stepIndex, EXECUTION_STATUS.ERROR, error),
        },
        selectedFiles,
      );
    } catch (error: unknown) {
      console.error("Automation execution failed:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const runningIndex = executionSteps.findIndex(
    (step) => step.status === EXECUTION_STATUS.RUNNING,
  );
  const failedStep = executionSteps.some(
    (step) => step.status === EXECUTION_STATUS.ERROR,
  );

  useEffect(() => {
    if (hasResults && !hadResultsRef.current) {
      summaryRef.current?.focus({ preventScroll: true });
    } else if (
      !hasResults &&
      hadResultsRef.current &&
      focusRunAfterUndo.current
    ) {
      // Undo succeeded: the results are gone and the inputs are back.
      focusRunAfterUndo.current = false;
      setExecutionSteps(initialSteps(automation));
      runButtonRef.current?.focus({ preventScroll: true });
    }
    hadResultsRef.current = hasResults;
  }, [hasResults, automation]);

  const canRetry = failedStep && !isExecuting;
  useEffect(() => {
    if (canRetry && !hadFailedStepRef.current) {
      retryRef.current?.focus({ preventScroll: true });
    }
    hadFailedStepRef.current = canRetry;
  }, [canRetry]);
  // A failure with no step to sit on (signature check, no server, preparing the
  // download after the last step) is shown under the list instead.
  const runError =
    !isExecuting && !failedStep ? automateOperation.errorMessage : null;
  const showsRunError = runError !== null;
  const hadRunErrorRef = useRef(false);
  useEffect(() => {
    if (showsRunError && !hadRunErrorRef.current) {
      runErrorRef.current?.focus({ preventScroll: true });
    }
    hadRunErrorRef.current = showsRunError;
  }, [showsRunError]);

  const stepCount = automation.operations.length;

  const runLabel = isExecuting
    ? runningIndex < 0
      ? t("automate.run.starting", "Starting…")
      : t("automate.run.progress", "Running step {{current}} of {{total}}…", {
          current: runningIndex + 1,
          total: stepCount,
        })
    : hasFiles
      ? t("automate.run.runOn", "Run on {{count}} files", {
          count: selectedFiles.length,
        })
      : t("automate.sequence.run", "Run automation");

  return (
    <>
      <AutomatePanelHeader
        title={
          automation.name ||
          t("automate.sequence.unnamed", "Unnamed automation")
        }
        subtitle={t("automate.sequence.steps", "{{count}} steps", {
          count: stepCount,
        })}
        info={automation.description || undefined}
        onBack={isExecuting ? undefined : onBack}
        actions={
          !isExecuting && (
            <AutomationActionsMenu
              actions={actions}
              label={t("automate.entryMenu.label", "Open menu for {{title}}", {
                title: automation.name,
              })}
            />
          )
        }
      />

      <div className={classes.stepsHeader}>
        <h3 className={classes.sectionLabel} data-flush>
          {t("automate.steps.label", "Steps")}
        </h3>
        {!isExecuting && (
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            leftSection={<Icon name={editAction.icon} size={14} />}
            onClick={editAction.onClick}
          >
            {editAction.label}
          </Button>
        )}
      </div>

      {/* Mounted before the run starts: a live region that appears with its
          first message is often not announced. */}
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>

      <div className={classes.stepList}>
        {automation.operations.map((op, index) => {
          const step = executionSteps[index];
          return (
            <Fragment key={`${op.operation}-${index}`}>
              {index > 0 && <StepConnector />}
              <AutomationStepCard
                index={index}
                status={step?.status}
                title={toolDisplayName(t, toolRegistry, op.operation)}
                meta={
                  stepsNeedingConfiguration.has(index) ? (
                    <span className={classes.needsConfiguration}>
                      {t(
                        "automate.steps.needsConfiguration",
                        "Needs configuration",
                      )}
                    </span>
                  ) : undefined
                }
                needsSettings={stepsNeedingConfiguration.has(index)}
              >
                {step?.error && (
                  <div className={classes.stepError} role="alert">
                    <span>{step.error}</span>
                    {/* Held until the run settles, so Retry cannot start a
                        second run under the one still finishing. */}
                    {!isExecuting && (
                      <div className={classes.stepErrorActions}>
                        <Button
                          variant="secondary"
                          accent="neutral"
                          size="sm"
                          leftSection={<Icon name="rotate-ccw" size={14} />}
                          onClick={executeAutomation}
                          disabled={!hasFiles || Boolean(runBlockedReason)}
                          ref={retryRef}
                        >
                          {t("automate.run.retry", "Retry")}
                        </Button>
                        <Button
                          variant="secondary"
                          accent="neutral"
                          size="sm"
                          leftSection={<Icon name="pencil" size={14} />}
                          onClick={() => onEditStep(index)}
                        >
                          {t("automate.run.editStep", "Edit step")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </AutomationStepCard>
            </Fragment>
          );
        })}
      </div>

      {runError && (
        <Text
          size="sm"
          role="alert"
          c="var(--c-danger)"
          ref={runErrorRef}
          tabIndex={-1}
        >
          {runError}
        </Text>
      )}

      {hasResults ? (
        <>
          <div
            className={classes.summary}
            role="status"
            ref={summaryRef}
            tabIndex={-1}
          >
            <div>
              {t("automate.run.allDone", "All {{count}} steps done", {
                count: stepCount,
              })}
            </div>
            <div className={classes.summaryActions}>
              <Button
                variant="secondary"
                accent="neutral"
                size="sm"
                leftSection={<Icon name="rotate-ccw" size={14} />}
                onClick={executeAutomation}
                disabled={!hasFiles || isUndoing || Boolean(runBlockedReason)}
              >
                {t("automate.run.runAgain", "Run again")}
              </Button>
              <Button
                variant="secondary"
                accent="neutral"
                size="sm"
                onClick={onDone}
              >
                {t("automate.run.done", "Done")}
              </Button>
            </div>
            {onRunOnFolder && (
              <button
                type="button"
                className={classes.runOnFolder}
                onClick={onRunOnFolder}
              >
                <Icon name="folder-input" size={16} />
                <span className={classes.runOnFolderText}>
                  <span className={classes.runOnFolderTitle}>
                    {t(
                      "automate.run.runOnFolderTitle",
                      "Run this on every new file",
                    )}
                  </span>
                  <span className={classes.runOnFolderHint}>
                    {t(
                      "automate.run.runOnFolderHint",
                      "Make it a pipeline in the PDF Processor",
                    )}
                  </span>
                </span>
                <Icon name="arrow-right" size={14} />
              </button>
            )}
          </div>
          <section className={classes.section}>
            <h3 className={classes.sectionLabel} data-flush>
              {t("automate.run.results", "Results")}
            </h3>
            {createReviewToolStep(asContent, {
              isVisible: true,
              operation: automateOperation,
              onFileClick,
              onUndo: undo,
            })}
          </section>
        </>
      ) : (
        <>
          <section className={classes.section}>
            <h3 className={classes.sectionLabel} data-flush>
              {t("files.title", "Files")}
            </h3>
            {hasFiles ? (
              createFilesToolStep(asContent, { selectedFiles })
            ) : (
              <div className={classes.needsFiles}>
                <span className={classes.needsFilesTitle}>
                  <Icon name="file-up" size={16} />
                  {t("automate.run.needsFile", "Add a PDF to run this")}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  leftSection={<Icon name="upload" size={14} />}
                  onClick={() => openFilesModal({})}
                >
                  {t("automate.run.upload", "Upload")}
                </Button>
              </div>
            )}
          </section>

          <div className={classes.footer}>
            <Button
              ref={runButtonRef}
              fullWidth
              leftSection={
                isExecuting ? (
                  <Loader size={14} color="currentColor" />
                ) : (
                  <Icon name="play" size={16} />
                )
              }
              onClick={executeAutomation}
              disabled={isExecuting || !hasFiles || Boolean(runBlockedReason)}
            >
              {runLabel}
            </Button>
            {runBlockedReason && (
              <p className={classes.hint} role="status">
                {runBlockedReason}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
